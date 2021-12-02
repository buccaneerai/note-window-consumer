const {expect} = require('chai');
const sinon = require('sinon');
const {marbles} = require('rxjs-marbles/mocha');
const {of} = require('rxjs');

const handleMessage = require('./handleMessage');

const fakeWords = [
  {text: 'foo'},
  {text: 'bar'},
];

describe('handleMessage', () => {
  it('should export a function', () => {
    expect(handleMessage).to.be.a('function');
    expect(handleMessage()).to.be.a('function');
  });

  it('should run its workflow correctly', marbles(m => {
    const message = {
      runId: 'fakerun',
      noteWindowId: 'fakenotewindow',
    };
    const storageStub = sinon.stub().returns(() => of('foo'));
    const predictionStub = sinon.stub().returns(source$ => of(['foo']));
    const options = {
      _fetchWordsForWindow: sinon.stub().returns(of(fakeWords)),
      _updateWorkStatus: sinon.stub().returns(of({fake: 'response'})),
      _toPredictions: predictionStub,
      _storePredictions: storageStub,
      _validateJob: sinon.stub().returns(m => of(m)),
    };
    const out$ = handleMessage(options)(message);
    const expected$ = m.cold('(0|)', [{fake: 'response'}]);
    m.expect(out$).toBeObservable(expected$);
  }));
});
