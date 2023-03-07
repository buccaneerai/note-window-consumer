const {expect} = require('chai');
const sinon = require('sinon');
const {marbles} = require('rxjs-marbles/mocha');

const sendWordsToQAModel = require('./sendWordsToQAModel');

const exampleResponses = {
  'F-HpiOnset-time': 'The problem started four weeks ago.',
  'F-HpiLocation-text': 'The person\'s problem is located in their forehead.',
  'F-HpiQuality-text': 'Pulsating and throbbing.',
  'F-HpiAggravatingFactor-text': 'Lights and sounds make the headache worse.',
  'F-HpiRelievingFactor-text': 'Taking ibuprofen and avoiding lights and loud sounds helps to reduce the headache.',
  'F-HpiNeutralFactor-text': 'The person tried Tylenol and it made no difference.',
  'F-HpiTiming-text': 'The problem usually happens during the fall and winter.',
  'F-HpiSeverity-category': ' Severe.'
};

const context = `
Hi. How are you doing today? Not great. What brings you in? Well, I have a really bad headache.
It feels like a pulsating, throbbing sensation.
It seems to always happen during the fall and winter. It hurts in my forehead.
It gets worse when there are lights or sounds. I took ibuprofin and that helps
a little bit. I took Tylenol and it made no difference. It initially began four
weeks ago and has been just terrible since.
`;

const findingAttributes = [
  {code: 'F-HpiOnset-time'},
  {code: 'F-HpiLocation-text'},
  {code: 'F-HpiQuality-text'},
  {code: 'F-HpiAggravatingFactor-text'},
  {code: 'F-HpiRelievingFactor-text'},
  {code: 'F-HpiNeutralFactor-text'},
  {code: 'F-HpiTiming-text'},
  {code: 'F-HpiSeverity-category'},
];

describe('sendWordstoQAModel', () => {
  it('should export a function', () => {
    expect(sendWordsToQAModel).to.be.a('function');
  });

  it('should handle all attributes properly', marbles(m => {
    const params = {
      runId: 'myrun',
      noteWindowId: 'mywindow',
      pipelineId: 'foobar',
      _sendOpenAIRequest: params => m.cold(
        '(0|)',
        [{text: exampleResponses[params.findingAttribute.code]}]
      ),
    };
    const actual$ = sendWordsToQAModel(params)({
      transcriptString: context,
      findingAttributes
    });
    const expected$ = m.cold('(0|)', [[
      {findingAttribute: {code: 'F-HpiOnset-time'}, text: 'four weeks ago'},
      {findingAttribute: {code: 'F-HpiLocation-text'}, text: 'forehead'},
      {findingAttribute: {code: 'F-HpiQuality-text'}, text: 'pulsating and throbbing'},
      {findingAttribute: {code: 'F-HpiAggravatingFactor-text'}, text: 'lights and sounds'},
      {findingAttribute: {code: 'F-HpiRelievingFactor-text'}, text: 'Taking ibuprofen and avoiding lights and loud sounds helps to reduce the headache.'},
      {findingAttribute: {code: 'F-HpiNeutralFactor-text'}, text: 'tylenol'},
      {findingAttribute: {code: 'F-HpiTiming-text'}, text: 'during the fall and winter'},
      {findingAttribute: {code: 'F-HpiSeverity-category'}, text: 'severe'},
    ]]);
    m.expect(actual$).toBeObservable(expected$);
  }));

  it('should handle F-HpiLocation-text', () => {

  });
});
