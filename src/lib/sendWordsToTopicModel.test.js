const {expect} = require('chai');
const sinon = require('sinon');
const {marbles} = require('rxjs-marbles/mocha');

const sendWordsToTopicModel = require('./sendWordsToTopicModel');

describe('sendWordsToTopicModel', () => {
  it('should export a function', () => {
    expect(sendWordsToTopicModel).to.be.a('function');
    expect(sendWordsToTopicModel()).to.be.a('function');
  });

  it('should generate correct output given correct input', marbles(m => {
    const fakeResponse = {
      Body: Buffer.from(JSON.stringify([{
        label: 'LABEL_5',
        score: 0.8250104188919067
      }])),
    };
    const _sagemaker = {
      invokeEndpoint: sinon.stub().returns({
        promise: sinon.stub().returns([fakeResponse])
      })
    };
    const params = {
      endpointName: 'huggingface-pytorch-inference-2023-03-01-04-38-47-018',
      _client: sinon.stub().returns(m.cold('-(0|)', [_sagemaker])),
      topK: 2,
      returnAllScores: true,
    };
    const actual$ = sendWordsToTopicModel(params)('foo bar.');
    const expected$ = m.cold('-(0|)', [
      [{
        label: 'F-HpiQuality-text',
        score: 0.8250104188919067,
        modelVersion: params.endpointName,
      }]
    ]);
    m.expect(actual$).toBeObservable(expected$);
  }));
});
