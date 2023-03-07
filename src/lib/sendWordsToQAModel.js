const _ = require('lodash');
const {merge,of,zip} = require('rxjs');
const {map,toArray} = require('rxjs/operators');

const sendOpenAIRequest = require('./sendOpenAIRequest');

const topics = {
  'F-HpiOnset-time': {
    question: '\nQ: When did the problem start?\nA: ',
    parseResponse: text => text
      .replace(/the\sproblem\sstarted\s/i, '')
      .replace(/\.$/, ''),
  },
  'F-HpiLocation-text': {
    question: '\nQ: Where in the person\'s body is the problem located? A: ',
    parseResponse: text => text
      .replace(/^the person\'s problem is located\s/i, '')
      .replace(/in\s/i, '')
      .replace(/their\s/, '')
      .replace(/\.$/, ''),
  },
  'F-HpiQuality-text': {
    question: '\nQ: Which one or two adjectives best describe the problem? A: ',
    parseResponse: text => text.toLowerCase().replace(/\.$/, ''),
  },
  'F-HpiAggravatingFactor-text': {
    question: '\nQ: What makes the problem worse?\nA: ',
    parseResponse: text => text
      .replace(/\.$/, '')
      .replace(/\s(make).*/, '')
      .toLowerCase(),
  },
  'F-HpiRelievingFactor-text': {
    question: '\nQ: What makes the problem better?\nA: ',
    parseResponse: text => text,
  },
  'F-HpiNeutralFactor-text': {
    question: '\nQ: What did the person try that had no effect on the problem?\nA: ',
    parseResponse: text => text.replace(/\.$/, '')
      .replace(/^.*(tried)\s/, '')
      .replace(/^(it).*$/, '')
      .replace(/\sand\sit\smade.*$/i, '')
      .toLowerCase(),
  },
  'F-HpiTiming-text': {
    question: '\nQ: At what times does the problem happen?\nA: ',
    parseResponse: text => text
      .replace(/^.*(happens|happen)\s/i, '')
      .replace(/\.$/, ''),
  },
  'F-HpiSeverity-category': {
    question: '\nQ: How severe is problem? (The answer should be one of these: mild, moderate, severe, very severe, or a number on a scaled of 1-10.) A: ',
    parseResponse: text => text.toLowerCase().replace(/\.$/, '').replace(/^\s/, ''),
  },
};

const formatPrompt = ({context, findingAttribute}) => {
  const question = _.get(topics, `${findingAttribute.code}.question`);
  const prompt = `${context}${question}`;
  return prompt;
};

const sendWordsToQAModel = ({_sendOpenAIRequest = sendOpenAIRequest} = {}) => (
  ({transcriptString, findingAttributes}) => {
    const observables = findingAttributes
      .filter(fAttr => _.get(topics, fAttr.code, false))
      .map(findingAttribute => zip(
        of(findingAttribute),
        _sendOpenAIRequest({
          findingAttribute, // for unit testing
          prompt: formatPrompt({context: transcriptString, findingAttribute})
        })
    ));
    const predictions$ = merge(...observables).pipe(
      // convert raw text to formatted text
      map(([fAttr, {text}]) => ({
        findingAttribute: fAttr,
        text: _.get(topics, `${fAttr.code}.parseResponse`)(text)
      })),
      toArray()
      // map(mapPredictionsToVerifiedFindings({runId, noteWindowId, pipelineId})),
    );
    return predictions$;
  }
);

module.exports = sendWordsToQAModel;
