const { of, from, forkJoin } = require('rxjs');
const fs = require('fs');
const get = require('lodash/get');
const isString = require('lodash/isString');
const _map = require('lodash/map');
const isArray = require('lodash/isArray');
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
        social: [],
        pmh: [],
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
        } else if (vf.findingCode === 'F-Family') {
          vfMap.family.push(vf);
        } else if (vf.findingCode === 'F-SocialSummary') {
          vfMap.social.push(vf);
        } else if (vf.findingCode === 'F-Pmh') {
          vfMap.pmh.push(vf);
        }
      });
      return [text, vfMap];
    }),
  );
};

const parseSection = (val, type) => {
  let value = val;
  if (isString(val)) {
    value = [val];
  }
  value = value.map((v) => {
    return v.replace('CAT Scan', 'CT Scan')
            .replace('cat scan', 'CT Scan')
            .replace('CAT scan', 'CT Scan')
            .trim();
  });
  if (type === 'ros') {
    value = value.filter((v) => v.toLowerCase().includes('asserts'));
    value = value.map((v) => v.replace('Asserts', '').replace('asserts', '').trim());
  }
  if (type === 'rosDenial') {
    value = value.filter((v) => v.toLowerCase().includes('denies'));
    value = value.map((v) => v.replace('Denies', '').replace('denies', '').trim());
  }
  return value;
};

const parseResponse = (response) => {
  let sections = {
    intro: [],
    cc: [],
    hpi: [],
    ros: [],
    rosDenial: [],
    problems: [],
    rx: [],
    family: [],
    allergies: [],
    pmh: [],
    social: [],
  }
  let json = null;
  try {
    json = JSON.parse(response);
  } catch (e) {
    logger.error(`Response from OPENAI was not JSON. Skipping...`);
    console.dir(response); // eslint-disable-line
    return sections;
  }
  sections = {
    intro: parseSection(json.intro || []),
    cc: parseSection(json.cc || []),
    hpi: parseSection(json.hpi || []),
    ros: parseSection(json.ros || [], 'ros'),
    rosDenial: parseSection(json.ros || [], 'rosDenial'),
    problems: parseSection(json.problems || []),
    rx: parseSection(json.rx || []),
    family: parseSection(json.fhx || []),
    allergies: parseSection(json.allergies || []),
    pmh: parseSection(json.pmh || []),
    social: parseSection(json.shx || [])
  };
  return sections;
};

const toOpenAI = ({
  start = Date.now(),
  model = 'gpt-4',
  temperature = 1.0,
  top_p = 0.1,
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
    temperature,
    top_p,
    messages: [
        {"role": "system", "content": `
You are an assistant that reads transcripts between a patient and a doctor, your job is to answer the following questions about the conversation as accurately as possible from the perpsective of the doctor.
You must never write the patient's name, gender or pronouns.
You must give the entire response back in JSON format.
`},
        {"role": "user", "content": `
The following is a transcript between a patient and a doctor: "${fullText}" \n\n
Looking over the transcript, what was the primary complaint the patient had? The answer should be a sentence long. The JSON key is 'intro'. Example: '34-year old patient presents with a severe headache that started last night.' \n
Looking over the transcript, what was the primary complaint the patient had? The answer should be as short as possible. The JSON key is 'cc'. Example: 'Severe headache' \n
Looking over the transcript, write a detailed summary of the history of the patient's current illness.  The answer should be 1 to 2 paragraphs long and should include any information the patient gives that about the symptoms and qualifies the symptoms including things that alleviate or aggravate the pain, when and where the symptoms started, how severe they are, etc.  The JSON key is 'hpi'.  Example: 'The patient is a 24 yo African-American man with h/o sickle cell disease who presented to the ED with a 2 day h/o bilateral knee pain. The pain began Thursday morning at approx 4:00 am while the patient was working the night shift at a department store. The pain was described as aching and had a gradual onset. The patient had difficulty sleeping Thursday because of the pain. The pain continued to gradually increase in severity to an 8/10 today. The pain was exacerbated with walking or standing and was not significantly relieved with Percocet that the patient had by prescription. The knee pain is unlike any prior episode of pain crisis. The patient reports some chills and mild SOB, but denies fever, N/V, cough, chest pain, abdominal pain or recent trauma to the knees. In the ED, the pain was primarily localized to the right knee and was 8/10 in intensity. The patient was started on NS at 125ml/hr and received two doses (6mg and 8mg) of morphine.' \n
Looking over the transcript, write a detailed list of the patient's prior medical history.  This should include the patient's past illnesses, diseases, surgical history, hospitalizations, and injuries.  Do not include anything about their family's medical history. This should be an array, the JSON key is 'pmh'. Example: '[\"Foot surgery\", \"Hospitalization for chest pain March 2023\", \"Prostate cancer\"]'. \n
Looking over the transcript, write a detailed list of the patient's family's medical history.  This should include past illnesses, diseases, surgical history, and hospitalizations for the patient's family including mother, father, brothers, sisters or grandparents. This should be an array, the JSON key is 'fhx'.  Example: '[\"Mother has diabetes\", \"Father had his gallbladder removed\", \"Family history of arthritis\"]' \n
Looking over the transcript, write a detailed summary of the patient's social history.  This should include things like recent travel, relationship status, marital status, diet, exercise, drug/tobacco/alcohol usage, education, employment, profession/work environment, thoughts of suicide, sexuality or sexual activity, number of children, etc. This should be 1 to 2 paragraphs long. The JSON key is 'shx'.  Example: 'Patient smokes a pack of cigarettes a day and is married with 2 children. Patient exercises twice a week.' \n
Looking over the transcript, write a list of the patient's allergies, as well as any allergy the patient denies having.  If the patient denies having any allergies, say, 'Patient denies allergies'. This should be an array, the JSON key is 'allergies'.  Example 1: '[\"Patient is allergic to peanuts\", \"Patient denies allergy to egg\"]'. Example 2: '[\"Patient denies allergies\"]' \n
Looking over the transcript, write a list of every medication the patient says they are currently taking. Do not include any medications the doctor prescribes in the transcript. Include any dosages if they are discussed, and only include real medications.  If you are unsure if the medication is spelled correctly, don't include it. If the patient denies taking any medication, then say, 'Patient denies taking any medication'. This should be an array, the JSON key is 'rx'. Example 1: '[\"Tylenol (500 mg; twice a day)\", \"Oflaxicin\"]' Example 2: '[\"Patient denies taking medication\"]' \n
Looking over the transcript, write a comprehensive list of the symptoms that were discussed in the transcript.  These should be as few words as possible to describe the symptom. If the patient asserts or confirms they are experiencing the symtpom, say 'Asserts [SYMPTOM]'.  If the patient denies having a symptom, say 'Denies [SYMPTOM]'. This should be an array, the JSON key is 'ros'.  Example: '[\"Asserts Headache\", \"Denies Nausea\", \"Asserts Blurred Vision\"]' \n
Looking over the transcript, write a detailed list of the doctor's assessment and the plan for that assessment. The assessment is the issue the doctor thinks they have or what needs to be addressed.  The plan is how the doctor is going to address the issue.  The format is '[ASSESSMENT]: [PLAN]'.  This should be an array, the JSON key is 'problems'.  Example: '[\"Nausea: Have patient take OTC Bismuth subsalicylate; Monitor and address during follow-up if persistent\", \"Possible meningitis: Order CT scan of the brain, followed by lumbar puncture if needed\", \"Pain: Administer morphine during visit; Prescribe Oxycodone (500mg; twice a day or as needed)\"] \n
`},
    ]
  })).pipe(
    map((response) => {
      const endTime = Date.now();
      const duration = parseInt(endTime - startTime, 10);
      const value = get(response, 'data.choices[0].message.content', '');
      const usage = get(response, 'data.usage', {});
      const sections = _parseResponse(value);
      logger.info(`duration: ${duration}`)
      logger.info(`usage: ${JSON.stringify(usage)}`);
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
  const description = get(sections, 'intro.0', '');
  let value = get(sections, 'cc.0', '');
  if (!value) {
    return {};
  }
  value = value.replace('Primary symptom:', '').trim()
  return {
    findingCode: 'F-ChiefComplaint',
    pipelineId,
    _id: vf._id,
    findingAttributes: [{
      findingAttributeKey: 'text',
      findingAttributeDescription: description,
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
  if (!value) {
    return {};
  }
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

const getSocialSummaryPrediction = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'social.0', {});
  const value = get(sections, 'social.0', '');
  if (!value) {
    return {};
  }
  return {
    findingCode: 'F-SocialSummary',
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
  let assertedSymptoms = get(sections, 'ros', []);
  assertedSymptoms = assertedSymptoms.map((s) => {
    const symptom = symptoms.find(s.label);
    if (symptom) {
      return {
        ...s,
        name: symptom.name,
      };
    }
    return {
      ...s,
      name: s.label.toLowerCase().trim(),
    };
  });
  const assertedLabels = assertedSymptoms.map((a) => a.name.trim().toLowerCase());
  const matchingSymptoms = ros.filter((s) => s.findingAttributeKey === 'code' && assertedLabels.includes(s.findingAttributeDescription.trim().toLowerCase()));
  const matchingSymptomLabels = matchingSymptoms.map((s) => s.findingAttributeDescription);
  const labels = assertedSymptoms.filter((s) => !matchingSymptomLabels.includes(s.name));
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
    return a.trim();
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
  const vf = get(vfMap, 'rx.0', {});
  const _medications = get(sections, 'rx', []);
  const medications = _medications.map((a) => {
    return a.trim();
  });
  const value = medications.join('\n');
  if (!value) {
    return {};
  }
  return {
    findingCode: 'F-Medication',
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

const getProblemSummaryPredictions = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'problems.0', {});
  const problems = get(sections, 'problems', []);
  const value = problems.join('\n');
  if (!value) {
    return {};
  }
  return {
    findingCode: 'F-Problem',
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

const getPmhSummaryPredictions = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'pmh.0', {});
  const pmh = get(sections, 'pmh', []);
  const value = pmh.join('\n');
  if (!value) {
    return {};
  }
  return {
    findingCode: 'F-Pmh',
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

const getFamilyHistorySummaryPrediction = ({
  vfMap,
  pipelineId,
  sections = {},
}) => {
  const vf = get(vfMap, 'family.0', {});
  const family = get(sections, 'family', []);
  const value = family.join('\n');
  if (!value) {
    return {};
  }
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
    } else if (isArray(v)) {
      v.forEach((a) => {
        if (a.label) {
          ros.push(a);
        }
      });
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
    }),
    getSocialSummaryPrediction({
      pipelineId,
      ...data,
    })
  ];
  return predictions;
};


const toOpenAISymptoms = ({
  model = 'gpt-3.5-turbo',
  temperature = 0.7,
  top_p = 1.0,
  _openai = openai,
  _logger = logger,
}) => (_symptoms) => {
  const fullText = JSON.stringify(_symptoms);
  if (!_symptoms.length) {
    return of({ values: [] });
  }
  return from(_openai.createChatCompletion({
    model,
    temperature,
    top_p,
    messages: [ // ADD MORE EXAMPLES HERE WHEN SOMETHING ISN'T CAPTURED PROPERLY
        {"role": "system", "content": `
You are an assistant that maps text descriptions of symptoms to this list of SYMPTOM_KEYS:

FEVER
Examples: "Fever", "Feeling hot", "High temperature"

HEADACHE
Examples: "Headache", "Head hurts"

SORE_THROAT
Examples: "Sore throat", "Pain in throat", "Hurts to swallow", "Throat ache"

DIZZYNESS
Examples: "Swaying", "Dizzy", "Dizzyness"

TIREDNESS
Examples: "Tiredness", "Overly tired", "Really tired", "Sleepy"

SWOLLEN_LYMPH_GLAND
Examples: "Swollen lymph nodes", "Lymph glands", "Swollen glands", "Swollen neck"

CHILLS
Examples: "Chills", "Shivering uncontrollably"

EASY_BRUISING
Examples: "Bruising", "Bruises easily"

LOSS_OF_CONSCIOUSNESS
Examples: "Loss of consciousness", "Unconscious"

VISION_FIELD_DEFECT
Examples: "Visual field defect", "Visual field", "Unable to see full field"

BLURRED_VISION
Examples: "Blurry vision", "Blurred vision"

EYE_PAIN
Examples: "Eye pain", "Pain in the eye"

PHOTOPHOBIA
Examples: "Sensitivity to light", "Photophobia"

HEMOPTYSIS
Examples: "Blood in cough", "Coughing up blood", "Cough with blood"

HEMATURIA
Examples: "Blood in urine", "Blood in pee"

RHINORRHEA
Examples: "Rhinorrhea", "Runny nose", "Nasal discharge", "Constantly blowing nose", "Post nasal drip"

HEARING_LOSS
Example: "Hearing loss", "Loss of hearing"

VOICE_CHANGE
Example: "Change in voice", "Voice change"

SINUS_CONGESTION
Example: "Stuffy nose", "Sinus congestion"

BREAST_SKIN_CHANGE

BREAST_LUMP

CHEST_DISCOMFORT

CHEST_PAIN

CHEST_TIGHTNESS

IRREGULAR_HEARTBEAT

PALPITATIONS

COUGH

WHEEZING

DIFFICULTY_BREATHING

DYSPNEA

RASH

MOLE_CHANGE

SKIN_CHANGE

NAIL_CHANGE

HAIR_CHANGE

NUMBNESS

WEAKNESS

VOMITING
Examples: "Vomiting", "Vomit", "Vomit due to pain"

NAUSEA

ABDOMINAL_PAIN

HEARTBURN

DIARRHEA

CONSTIPATION

BLOODY_STOOL

JOINT_PAIN

SWOLLEN_JOINT

MUSCLE_PAIN
Examples: "Muscle pain", "Low back pain", "Sore muscles", "Arm pain", "Leg pain"

MUSCLE_WEAKNESS

DIFFICULTY_SLEEPING

FREQUENT_AWAKENING

ANXIETY

DEPRESSED_MOOD

LOSS_OF_MOTIVATION

THOUGHTS_OF_SELF_HARM

DIFFICULTY_URINATING

ERECTILE_DYSFUNCTION

INCOMPLETE_EMPTYING_OF_BLADDER

WAKING_UP_TO_URINATE

TESTICULAR_LUMP

TESTICULAR_PAIN

POSTMENOPAUSAL_BLEEDING

PAINFUL_PERIOD

CHANGES_TO_PERIOD

VAGINAL_DISCHARGE

URINARY_INCONTINENCE

`},
        {"role": "user", "content": `
Map the following VALUES to a SYMPTOM_KEY and return the answer as a JSON array, the example response should look like [{"key": "HEADACHE", "value": "Head pain"}, {"key": "NAUSEA", "value": "Upset stomach"}, {"key": "DIFFICULTY_BREATHING", "value": "Shortness of breath"}].
If you are unable to map a value the symptom key should be 'UNKNOWN'.  The return value must be JSON.

Symptoms:
${fullText}
`},
    ]
  })).pipe(
    map((response) => {
      const value = get(response, 'data.choices[0].message.content', '');
      const usage = get(response, 'data.usage', {});
      let arr = [];
      try {
        arr = JSON.parse(value);
      } catch (e) {
        console.error(`Unable to parse response: ${e}`);
      }
      const values = arr.map((a) => a.key || 'UNKNOWN');
      logger.info(`usage: ${JSON.stringify(usage)}`);
      return {values, usage};
    }),
    catchError((error) => {
      _logger.error(error.toJSON ? error.toJSON().message : error);
      return null;
    })
  );
};


const toOpenAIHPI = ({
  model = 'gpt-4',
  temperature = 1.0,
  top_p = 0.7,
  _openai = openai,
  _logger = logger,
  _parseResponse = parseResponse,
}) => ({sections, ...rest }) => {
  if (!sections.hpi[0]) {
    return of({...rest, sections});
  }
  return from(_openai.createChatCompletion({
    model,
    temperature,
    top_p,
    messages: [
        {"role": "system", "content": `
You are an assitant that reads the history of present illness in a clincial SOAP note, and finds symptoms.
You must give the entire response back in JSON format.
`},
        {"role": "user", "content": `
The following is an HPI section of a doctor's note: "${sections.hpi[0] || ""}" \n\n
Write a comprehensive list of the symptoms that were discussed in the transcript.  These should be as few words as possible to describe the symptom. If the patient asserts or confirms they are experiencing the symptom, say 'Asserts [SYMPTOM]'.  If the patient denies having a symptom, say 'Denies [SYMPTOM]'. This should be an array, the JSON key is 'ros'.  Example: '{ros: [\"Asserts Headache\", \"Denies Nausea\", \"Asserts Blurred Vision\"]}' \n
`},
    ]
  })).pipe(
    map((response) => {
      const value = get(response, 'data.choices[0].message.content', '');
      const usage = get(response, 'data.usage', {});
      const _sections = {
        ...sections,
      }
      const newSections = _parseResponse(value);
      _sections.ros = [...newSections.ros, ...sections.ros];
      _sections.rosDenial = [...newSections.rosDenial, ...sections.rosDenial];
      logger.info(`usage: ${JSON.stringify(usage)}`);
      return {...rest, sections: _sections};
    }),
    catchError((error) => {
      _logger.error(error.toJSON ? error.toJSON().message : error);
      return {...rest, sections};
    })
  );
};


const toGPT4 = ({
  runId,
  noteWindowId,
  pipelineId,
  model,
  start,
  _fetchVerifiedFindings = fetchVerifiedFindings,
  _mapCodeToPredictions = mapCodeToPredictions,
  _toOpenAI = toOpenAI,
  _toOpenAIHPI = toOpenAIHPI,
  _toOpenAISymptoms = toOpenAISymptoms,
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
    mergeMap(_toOpenAIHPI({
      runId,
      model,
      start,
    })),
    mergeMap(({sections, ...rest}) => {
      let _symptoms = sections.ros || [];
      let _denials = sections.rosDenial || [];
      const gptRequests = _toOpenAISymptoms({})(_symptoms).pipe(
        map(({values}) => {
          return values.map((a) => {
            return { label: a, score: 0.5, isAsserted: true };
          })
        })
      );
      const gptRequestsDenials = _toOpenAISymptoms({})(_denials).pipe(
        map(({values}) => {
          return values.map((a) => {
            return { label: a, score: 0.5, isAsserted: false };
          })
        })
      );
      return forkJoin(of({sections, ...rest}), gptRequests, gptRequestsDenials);
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
