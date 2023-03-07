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
    const params = {
      client: sinon.stub().returns({
        invokeEndpoint: sinon.stub().returns({
          promise: sinon.stub().returns([fakeResponse])
        })
      })
    };
    const actual$ = sendWordsToTopicModel(params)('foo bar.');
    const expected$ = m.cold('(0|)', [
      [{label: 'F-HpiQuality-text', score: 0.8250104188919067}]
    ]);
    m.expect(actual$).toBeObservable(expected$);
  }));
});
