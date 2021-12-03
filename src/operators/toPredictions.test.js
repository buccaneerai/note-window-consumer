const {expect} = require('chai');
const sinon = require('sinon');
const {marbles} = require('rxjs-marbles/mocha');

const toPredictions = require('./toPredictions');

describe('toPredictions', () => {
  it('should export a function', () => {
    expect(toPredictions).to.be.a('function');
    expect(toPredictions()).to.be.a('function');
  });

  it('should properly call and merge prediction operators', marbles(m => {
    const predictions0 = [{findingCode: 'foo0'}];
    const opStub0 = sinon.stub().returns(m.cold('--0|', [predictions0]));
    const predictions1 = [{findingCode: 'foo1'}];
    const opStub1 = sinon.stub().returns(m.cold('-----0|', [predictions1]));
    const _pipelines = {
      spacy: {
        options: () => ({type: 'fakeconfig1'}),
        operator: () => opStub0,
      },
      infoRetrieval: {
        options: () => ({type: 'fakeconfig2'}),
        operator: () => opStub1,
      }
    };
    const words = [{text: 'foo'}, {text: 'bar'}];
    const out$ = toPredictions({_pipelines})({words});
    const expected$ = m.cold('--0--1|', [predictions0, predictions1]);
    m.expect(out$).toBeObservable(expected$);
  }));
});
