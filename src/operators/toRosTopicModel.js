const { of } = require('rxjs');
const { map, mergeMap, toArray, catchError, filter } = require('rxjs/operators');
const logger = require('@buccaneerai/logging-utils');

const sendWordsToTopicModel = require('../lib/sendWordsToTopicModel');

const symptoms = require('../lib/symptoms');


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
  let chiefComplaint;
  const {labels} = resp;
  const predictions = labels.map((e) => {
    const { label: code, score } = e;

    const symptom = symptoms.find(code);

    // Don't include findings with low overall confidence
    if (score < 0.10) {
      return {};
    }

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
    };
    if (findingCode === 'F-Symptom' && !chiefComplaint) {
      chiefComplaint = {
        ...prediction,
        findingCode: 'F-ChiefComplaint',
        findingAttributes: [...findingAttributes, {
          findingAttributeKey: 'text',
          findingAttributeValue: context,
          findingAttributeDescription: cleanDescription(findingAttributeDescription),
          findingAttributeScore,
        }]
      }
    }
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

  // Add chief complaint if one doesnt already exist,
  // the attributes will only insert on the mongo side
  // if they dont already exist
  if (chiefComplaint) {
    predictions.push(chiefComplaint);
  }

  // Return only entities we found a findingCode for and deduplicate it
  const foundCodes = [];
  const filteredPredictions = predictions.filter((p) => {
    if (p.findingCode === 'F-ChiefComplaint') {
      // Don't include the code from the ChiefComplaint in the de-dupe list
      return true;
    }
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

const toRosTopicModel = ({
  runId,
  noteWindowId,
  pipelineId,
  endpointName,
  _sendWordsToTopicModel = sendWordsToTopicModel,
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
    mergeMap(mapCodeToPredictions({
      runId,
      noteWindowId,
      pipelineId,
    })),
    toArray(),
    catchError((error) => {
      _logger.error(error.toJSON ? error.toJSON().message : error);
      return of({});
    }),
    map((predictions) => {
      return predictions.filter((f) => f.findingCode);
    })
  )
};

module.exports = toRosTopicModel;
