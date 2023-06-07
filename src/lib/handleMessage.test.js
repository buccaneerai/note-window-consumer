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
      start: 0,
    };
    const storageStub = sinon.stub().returns(() => of('foo'));
    const predictionStub = sinon.stub().returns(source$ => of(['prediction']));
    const options = {
      _fetchWordsForWindow: () => sinon.stub().returns(of(fakeWords)),
      _fetchNoteWindow: () => sinon.stub().returns(of({start: 0})),
      _fetchNoteWindows: () => sinon.stub().returns(of({_id: 'foo'})),
      _fetchRun: () => sinon.stub().returns(of({_id: 'foo', status: 'running'})),
      _updateStatus: () => sinon.stub().returns(of({})),
      _toPredictions: predictionStub,
      _storePredictions: storageStub,
      _validateJob: sinon.stub().returns(m => of(m)),
      _updateNoteWindow: sinon.stub().returns(of(null)),
    };
    const out$ = handleMessage(options)(message);
    const expected$ = m.cold('(0|)', [['prediction']]);
    m.expect(out$).toBeObservable(expected$);
  }));
});
