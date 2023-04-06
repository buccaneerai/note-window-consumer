const { of, from, forkJoin } = require('rxjs');
const get = require('lodash/get');
const _map = require('lodash/map');
const { map, mergeMap, toArray, catchError, filter } = require('rxjs/operators');
const {Configuration, OpenAIApi} = require('openai');

const {client} = require('@buccaneerai/graphql-sdk');
const logger = require('@buccaneerai/logging-utils');

const sendWordsToTopicModel = require('../lib/sendWordsToTopicModel');
const symptoms = require('../lib/symptoms');

const openAiConf = new Configuration({apiKey: process.env.OPENAI_API_KEY});
const openai = new OpenAIApi(openAiConf);

const fetchVerifiedFindings = ({
  runId,
  graphqlUrl = process.env.GRAPHQL_URL,
  token = process.env.JWT_TOKEN,
  _client = client
}) => (text) => {
  const gql = _client({url: graphqlUrl, token});
  return gql.findVerifiedFindings({
    filter: {
      runId,
    }
  }).pipe(
    map(({verifiedFindings = []}) => {
      const vfMap = {
        context: [],
        cc: [],
        hpi: [],
        ros: [],
        allergies: [],
        rx: [],
        family: [],
        problems: [],
      };
      verifiedFindings.forEach((vf) => {
        if (vf.findingCode === 'F-Context') {
          vfMap.context.push(vf);
        } else if (vf.findingCode === 'F-ChiefComplaint') {
          vfMap.cc.push(vf);
        } else if (vf.findingCode === 'F-Symptom') {
          vfMap.ros.push(vf);
        } else if (vf.findingCode === 'F-Problem') {
          vfMap.problems.push(vf);
        } else if (vf.findingCode.startsWith('F-Hpi')) {
          vfMap.hpi.push(vf);
        } else if (vf.findingCode === 'F-Allergy') {
          vfMap.allergies.push(vf);
        } else if (vf.findingCode === 'F-Medication') {
          vfMap.rx.push(vf);
        }
      });
      return [text, vfMap];
    }),
  );
};

const parseSection = (value) => {
  const arr = value.split('\n');
  const values = arr.filter((v) => {
    if (!v || !v.length || v === '\n') {
      return false;
    }
    if (v.includes('NONE')) {
      return false;
    }
    const trimmed = v.trim();
    if (!trimmed || !trimmed.length) {
      return false;
    }
    return true;
  });
  return values.map((v) => {
    let _value = v.trim();
    _value = _value.replace(/^\d+\s*[-\\.)]?\s+/g, '');
    return _value;
  });
};

const parseResponse = (response) => {
  let sections = {
    cc: [],
    hpi: [],
    ros: [],
    rosDenial: [],
    problems: [],
    rx: [],
    family: [],
    allergies: [],
    pmh: [],
  }
  // Split on the "STOP" keyword
  const arr = response.split('STOP');
  // If we don't get the same numnber of questions back, assume something failed.
  const numSections = Object.keys(sections).length + 1;
  if (arr.length !== numSections) { // configured based on number of questions
    logger.error(`Response from OPENAI did not have the requisite number of sections ${numSections}. Skipping...`);
    return sections;
  }
  sections = {
    cc: parseSection(arr[1]),
    hpi: parseSection(arr[6]),
    ros: parseSection(arr[0]),
    rosDenial: parseSection(arr[8]),
    problems: parseSection(arr[2]),
    rx: parseSection(arr[3]),
    family: parseSection(arr[5]),
    allergies: parseSection(arr[4]),
    pmh: parseSection(arr[7]),
  };
  return sections;
};

const toOpenAI = ({
  start = Date.now(),
  model = 'gpt-4',
  _openai = openai,
  _logger = logger,
  _parseResponse = parseResponse,
}) => ([text, vfMap = {}]) => {
  const context = vfMap.context[0] || { stringValues: [] };
  const contextStr = context.stringValues[0] || '[]';
  const contextArr = JSON.parse(contextStr) || [];
  contextArr.push({start, text});
  const sortedStrings = contextArr.sort((a,b) => a.start - b.start);
  const newContext = JSON.stringify(sortedStrings);
  let fullText = _map(sortedStrings, 'text').join(' ');
  const startTime = Date.now();
  return from(_openai.createChatCompletion({
    model,
    messages: [
        {"role": "system", "content": "You are an assistant that reads transcripts between a patient and a doctor.  Your job is to answer the following questions about the conversation as accurately as possible. Never write the patient's name, gender or pronouns."},
        {"role": "user", "content": `The following is a transcript between a patient and a doctor: \`${fullText}\``},
        {"role": "user", "content": `\
Answer the following question as a numbered list with each answer on a new line, if there were no symptoms present, then reply \`NONE\`. After the list of symptoms, say \`STOP\`: What were the patient's symptoms? \n
Answer the following question with as few words as possible, if there is no answer, then reply \`NONE\`. After the answer, say \`STOP\`: What was the primary symptom? \n
Answer the following question as a numbered list with each answer on a new line, if there is no assessment or plan, then reply \`NONE\`. After the answer, say \`STOP\`: What was the doctor's assessment and plan? \n
Answer the following question as a numbered list with each answer on a new line, if there is no medications, then reply \`NONE\`. After the answer, say \`STOP\`: What medications is the patient taking or the doctor prescribe? \n
Answer the following question as a numbered list with each answer on a new line, if there is no allergies, then reply \`NONE\`. After the answer, say \`STOP\`: What allergies does the patient have? \n
Summarize any issues with the patient's family. If there are no issues, then reply \`NONE\`. After the summary, say \`STOP\`.  \n
Without including any of the doctor's assesment or plan, write a history of the present illness without using the patient's name. After the summary, say \`STOP\`. \n
Answer the following question as a numbered list with each answer on a new line, if there is no allergies, then reply \`NONE\`. After the answer, say \`STOP\`: Without including the family history or current illness, what is the patient's past medical history? \n
Answer the following question as a numbered list with each answer on a new line, if there were no symptoms present, then reply \`NONE\`. After the list of symptoms, say \`STOP\`: What symptoms did the patient deny having?`}
    ]
  })).pipe(
    map((response) => {
      const endTime = Date.now();
      const duration = parseInt(endTime - startTime, 10);
      const value = get(response, 'data.choices[0].message.content', '');
      const usage = get(response, 'data.usage', {});
      const sections = _parseResponse(value);
      return {sections, text, context, newContext, duration, usage, vfMap};
    }),
    catchError((error) => {
      _logger.error(error.toJSON ? error.toJSON().message : error);
      return null;
    })
  );
};

const getContextPrediction = ({
  newContext,
  vfMap,
  pipelineId,
}) => {
  const vf = get(vfMap, 'context.0', {});
  return {
    _id: vf._id || null,
    findingCode: 'F-Context',
    pipelineId,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [newContext],
      findingAttributeScore: 1.0,
      pipelineId,
    }]
  };
};

const getChiefComplaintPrediction = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'cc.0', {});
  let value = get(sections, 'cc.0', '');
  value = value.replace('Primary symptom:', '').trim()
  return {
    findingCode: 'F-ChiefComplaint',
    pipelineId,
    _id: vf._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [value],
      findingAttributeScore: 0.5,
      pipelineId,
    }]
  };
};

const getHPISummaryPrediction = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'hpi.0', {});
  const value = get(sections, 'hpi.0', '');
  return {
    findingCode: 'F-HpiSummary',
    pipelineId,
    _id: vf._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [value],
      findingAttributeScore: 0.5,
      pipelineId,
    }]
  };
};

const getROSPredictions = ({
  vfMap,
  pipelineId,
  sections = {}
}) => {
  const ros = vfMap.ros || [];
  const assertedSymptoms = get(sections, 'ros', []);
  const assertedLabels = assertedSymptoms.map((a) => a.label.trim().toLowerCase());
  const matchingSymptoms = ros.filter((s) => s.findingAttributeKey === 'code' && assertedLabels.includes(s.findingAttributeDescription.trim().toLowerCase()));
  const matchingSymptomLabels = matchingSymptoms.map((s) => s.findingAttributeDescription);
  const labels = assertedSymptoms.filter((s) => !matchingSymptomLabels.includes(s.label.trim().toLowerCase()));
  const predictions = labels.map((label) => {

    const symptom = symptoms.find(label.label);
    if (!symptom) {
      return {};
    }
    if (!symptom.sctid) {
      return {};
    }

    const { isAsserted = true } = label;

    const findingCode = 'F-Symptom';
    const context = '';
    const findingAttributeCode = symptom.sctid;
    const findingAttributeScore = label.score || 0.5;
    const findingAttributeDescription = symptom.name;
    const findingAttributeIsAssertedScore = 0.5;
    const findingAttributeIsAssertedDescription = '';

    const findingAttributes = [{
      findingAttributeKey: 'code',
      findingAttributeValue: findingAttributeCode,
      findingAttributeDescription,
      findingAttributeScore,
    }];
    const prediction = {
      findingCode,
      context,
      findingAttributes,
    };
    prediction.findingAttributes.push({
      findingAttributeKey: 'isAsserted',
      findingAttributeValue: isAsserted,
      findingAttributeDescription: findingAttributeIsAssertedDescription,
      findingAttributeScore: findingAttributeIsAssertedScore,
    })
    prediction.findingAttributes.push({
      findingAttributeKey: 'bodySystem',
      findingAttributeValue: symptom.bodySystem,
      findingAttributeScore: 0.5,
    });
    return prediction;
  });

  // Return only entities we found a findingCode for and deduplicate it
  const foundCodes = [];
  const filteredPredictions = predictions.filter((p) => {
    if (p.findingCode) {
      const { findingAttributes = [] } = p;
      const [codeAttribute] = findingAttributes;
      if (foundCodes.includes(codeAttribute.findingAttributeValue)) {
        return false;
      }
      foundCodes.push(codeAttribute.findingAttributeValue)
      return true;
    }
    return false;
  });
  return filteredPredictions.map((f) => {
    return {
      ...f,
      pipelineId,
    }
  });
};

const getAllergyPredictions = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vfs = get(vfMap, 'allergies', []);
  const _allergies = get(sections, 'allergies', []);
  const allergies = _allergies.map((a) => {
    return a.replace('Allergic to', '').trim();
  });
  const matchingAllergies = vfs.filter((s) => s.findingAttributeKey === 'text' && allergies.includes(s.stringValues[0]));
  const matchingAllergiesLabels = matchingAllergies.map((s) => s.stringValues[0]);
  const newAllergies = allergies.filter((s) => !matchingAllergiesLabels.includes(s));
  const predictions = newAllergies.map((a) => {
    return {
      findingCode: 'F-Allergy',
      pipelineId,
      _id: null,
      findingAttributes: [{
        findingAttributeKey: 'text',
        stringValues: [a],
        findingAttributeScore: 0.5,
        pipelineId,
      }]
    };
  });
  return predictions;
};

const getMedicationPredictions = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vfs = get(vfMap, 'rx', []);
  const _medications = get(sections, 'rx', []);
  const medications = _medications.map((a) => {
    return a.trim();
  });
  const matchingMedications = vfs.filter((s) => s.findingAttributeKey === 'text' && medications.includes(s.stringValues[0]));
  const matchingMedicationsLabels = matchingMedications.map((s) => s.stringValues[0]);
  const newMedications = medications.filter((s) => !matchingMedicationsLabels.includes(s));
  const predictions = newMedications.map((a) => {
    return {
      findingCode: 'F-Medication',
      pipelineId,
      _id: null,
      findingAttributes: [{
        findingAttributeKey: 'text',
        stringValues: [a],
        findingAttributeScore: 0.5,
        pipelineId,
      }]
    };
  });
  return predictions;
};

const getProblemSummaryPredictions = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'problems.0', {});
  const problems = get(sections, 'problems', []);
  return {
    findingCode: 'F-Problem',
    pipelineId,
    _id: vf._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [problems.join('\n')],
      findingAttributeScore: 0.5,
      pipelineId,
    }]
  };
};

const getPmhSummaryPredictions = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'pmh.0', {});
  const pmh = get(sections, 'pmh', []);
  return {
    findingCode: 'F-Pmh',
    pipelineId,
    _id: vf._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [pmh.join('\n')],
      findingAttributeScore: 0.5,
      pipelineId,
    }]
  };
};

const getFamilyHistorySummaryPrediction = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'family.0', {});
  const value = get(sections, 'family.0', '');
  return {
    findingCode: 'F-Family',
    pipelineId,
    _id: vf._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      stringValues: [value],
      findingAttributeScore: 0.5,
      pipelineId,
    }]
  };
};

const mapCodeToPredictions = ({
  pipelineId,
}) => ([values]) => {
  let data = {};
  const ros = [];
  values.forEach((v) => {
    if (v.sections) {
      data = v;
    } else if (v.label) {
      ros.push(v);
    }
  });
  // special case for ROS
  data.sections.ros = ros;
  // @TODO
  // const {
  //   duration,
  //   usage,
  // } = data;
  const predictions = [
    getContextPrediction({
      pipelineId,
      ...data
    }),
    getChiefComplaintPrediction({
      pipelineId,
      ...data,
    }),
    getHPISummaryPrediction({
      pipelineId,
      ...data,
    }),
    getROSPredictions({
      pipelineId,
      ...data,
    }),
    getProblemSummaryPredictions({
      pipelineId,
      ...data,
    }),
    getAllergyPredictions({
      pipelineId,
      ...data,
    }),
    getMedicationPredictions({
      pipelineId,
      ...data,
    }),
    getPmhSummaryPredictions({
      pipelineId,
      ...data,
    }),
    getFamilyHistorySummaryPrediction({
      pipelineId,
      ...data,
    })
  ];
  return predictions;
};

const toGPT4 = ({
  runId,
  noteWindowId,
  pipelineId,
  model,
  start,
  endpointName,
  _fetchVerifiedFindings = fetchVerifiedFindings,
  _sendWordsToTopicModel = sendWordsToTopicModel,
  _mapCodeToPredictions = mapCodeToPredictions,
  _toOpenAI = toOpenAI,
  _logger = logger,
} = {}) => words$ => {
  return words$.pipe(
    map((words) => {
      return words.reduce((acc, w) => {
        if (acc.text !== undefined) {
          return `${acc.text} ${w.text}`;
        }
        return (acc ? `${acc} ${w.text}` : w.text);
      });
    }),
    filter((f) => f && f.length),
    mergeMap(_fetchVerifiedFindings({
      runId
    })),
    mergeMap(_toOpenAI({
      runId,
      model,
      start,
    })),
    mergeMap(({sections, ...rest}) => {
      let _symptoms = sections.ros || [];
      let _denials = sections.rosDenial || [];
      const gptRequests = _symptoms.map((symptom) => {
        return _sendWordsToTopicModel({
          endpointName,
          returnAllScores: true,
          topK: 1
        })(symptom).pipe(
          map(([response]) => {
            const value = get(response, 'labels.0', {});
            const { label: _label , score } = value;
            let label = _label;
            if (score < 0.25) {
              label = null;
            }
            return {label, score, isAsserted: true};
          })
        );
      });
      const gptRequestsDenials = _denials.map((symptom) => {
        return _sendWordsToTopicModel({
          endpointName,
          returnAllScores: true,
          topK: 1
        })(symptom).pipe(
          map(([response]) => {
            const value = get(response, 'labels.0', {});
            const { label: _label , score } = value;
            let label = _label;
            if (score < 0.25) {
              label = null;
            }
            return {label, score, isAsserted: false};
          })
        );
      });
      return forkJoin(of({sections, ...rest}), ...gptRequests, ...gptRequestsDenials);
    }),
    toArray(),
    map(_mapCodeToPredictions({
      runId,
      noteWindowId,
      pipelineId,
    })),
    toArray(),
    catchError((error) => {
      _logger.error(error.toJSON ? error.toJSON().message : error);
      return of({});
    }),
    map(([predictions]) => {
      const flat = predictions.flat();
      return flat.filter((f) => f.findingCode);
    })
  )
};

module.exports = toGPT4;
