const {
  of,
  forkJoin,
  from
} = require('rxjs');
const { map, mergeMap, toArray, catchError, filter } = require('rxjs/operators');
const logger = require('@buccaneerai/logging-utils');
const get = require('lodash/get');
const omit = require('lodash/omit');
const {Configuration, OpenAIApi} = require('openai');

const sendWordsToTopicModel = require('../lib/sendWordsToTopicModel');

const symptoms = require('../lib/symptoms');

const openAiConf = new Configuration({apiKey: process.env.OPENAI_API_KEY});
const openai = new OpenAIApi(openAiConf);


const cleanDescription = (_text='') => {
  let text = _text;
  // We may want these in the DB, let the front end scrub it
  // during rendering
  // text = text.replace(' (finding)', '');
  // text = text.replace(' (disorder)', '');
  // text = text.replace(' (severity modifier)', '');
  // text = text.replace(' (qualifier value)', '');
  // text = text.replace(' (morphologic abnormality)', '');
  return text
};


const mapCodeToPredictions = ({
  pipelineId,
}) => ([resp]) => {
  const {labels, text} = resp;
  const predictions = labels.map((e) => {
    const { label: code, score } = e;

    const symptom = symptoms.find(code);

    // Don't include findings with low overall confidence
    // if (score < 0.10) {
    //   return {};
    // }

    const findingCode = 'F-Symptom';
    const isAsserted = true;
    const context = '';
    const findingAttributeCode = symptom.sctid;
    const findingAttributeScore = score;
    const findingAttributeDescription = symptom.name;
    const findingAttributeIsAssertedScore = 0.5;
    const findingAttributeIsAssertedDescription = '';

    const findingAttributes = [{
      findingAttributeKey: 'code',
      findingAttributeValue: findingAttributeCode,
      findingAttributeDescription: cleanDescription(findingAttributeDescription),
      findingAttributeScore,
    }];
    const prediction = {
      findingCode,
      context,
      findingAttributes,
      text,
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

const toOpenAI = ({
  model = 'gpt-4',
  _logger = logger,
  _openai = openai
}) => ({prediction = {}}) => {
  const { text } = prediction;
  const code = prediction.findingAttributes.find((f) => f.findingAttributeKey === 'code');
  const symptom = code.findingAttributeDescription
    .replace('symptom', '')
    .replace('(finding)', '')
    .replace('(disorder)', '')
    .replace('(body structure)', '')
    .trim().toLowerCase();

  return from(_openai.createChatCompletion({
    model,
    messages: [
        {"role": "system", "content": "You are an assistant that reads transcripts between a patient and a doctor.  Your job is to answer the following questions about the conversation as accurately as possible."},
        {"role": "user", "content": `The following is a transcript between a patient and a doctor: \`${text}\``},
        {"role": "user", "content": `Does this transcript discuss the symptom "${symptom}" and does the patient assert or deny having the symptom "${symptom}`}
    ]
  })).pipe(
    map((response) => {
      const value = get(response, 'data.choices[0].message.content', '');
      if (value.toLowerCase().includes('no,') || value.toLowerCase().includes('does not mention') || value.toLowerCase().includes('does not discuss')) {
        return {};
      }
      let isAsserted = true;
      if (value.toLowerCase().includes('does not assert or deny')) {
        isAsserted = true;
      } else if (value.toLowerCase().includes('asserts')) {
        isAsserted = true;
      } else if (value.toLowerCase().includes('denies')) {
        isAsserted = false;
      } else {
        isAsserted = true;
      };
      const findingAttributes = prediction.findingAttributes.map((f) => {
        const attr = {
          ...f,
        };
        if (f.findingAttributeKey === 'isAsserted') {
          attr.booleanValues = [isAsserted];
          attr.findingAttributeValue = isAsserted;
        }
        return attr;
      });
      const resp = {
        ...prediction,
        findingAttributes,
      };
      return omit(resp, ['text']);
    }),
    catchError((error) => {
      _logger.error(error.toJSON ? error.toJSON().message : error);
      return null;
    })
  );
};

const toRosTopicModel = ({
  runId,
  noteWindowId,
  pipelineId,
  endpointName,
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
    mergeMap(_sendWordsToTopicModel({
      endpointName,
      returnAllScores: true,
      topK: 3
    })),
    map(_mapCodeToPredictions({
      runId,
      noteWindowId,
      pipelineId,
    })),
    mergeMap((predictions) => {
      const gptRequests = predictions.map((prediction) => {
        return _toOpenAI({
          model: 'gpt-4'
        })({prediction});
      });
      return forkJoin(...gptRequests);
    }),
    toArray(),
    catchError((error) => {
      _logger.error(error.toJSON ? error.toJSON().message : error);
      return of({});
    }),
    map(([predictions]) => {
      return predictions.filter((f) => f.findingCode);
    })
  )
};

module.exports = toRosTopicModel;
