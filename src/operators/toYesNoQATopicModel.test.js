const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} = 'rxjs-require(marbles/mocha');

const toYesNoQAModel = require('./toYesNoQATopicModel');

const {testExports} = toYesNoQAModel;
const {
  mapResponseToConfidence,
  mapResponseAndCodeToPrediction,
} = testExports;

describe('toYesNoQAModel', () => {
  it('should export a function', () => {
    expect(toYesNoQAModel).to.be.a('function');
  });

  it('should map response to confidence', () => {
    const response = {
      data: {
        predictions: [{label: 'yes', score: 0.75}, {label: 'no', score: 0.25}],
      }
    };
    const result = mapResponseToConfidence()(response);
    expect(result).to.equal(0.75);
  });

  it('should map response and topic code to a prediction', () => {
    const response = {data: {predictions: [{label: 'yes', score: 0.75}, {label: 'no', score: 0.25}]}};
    const code = 'hpiSeverity';
    const params = {
      runId: 'rascalliousRun',
      noteWindowId: 'miscreantNoteWindow',
      model: 'roberta_base_qa_yn',
    };
    const result = mapResponseAndCodeToPrediction(params)([response, code]);
    const expected = {
      runId: params.runId,
      noteWindowId: params.noteWindowId,
      findingCode: code,
      confidence: 0.75,
      model: 'roberta_base_qa_yn',
      strategy: 'boolQModel',
      model: 'roberta_base_qa_yn',
      predictionTask: 'topic',
    };
    expect(result).to.deep.equal(expected);
  });
});
