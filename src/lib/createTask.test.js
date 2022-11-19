const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} = require('rxjs-marbles/mocha');

const createTask = require('./createTask');

describe('createTask', () => {
  it('should export a function', () => {
    expect(createTask).to.be.a('function');
  });

  it('should return error observable if noteWindowId is missing', marbles(m => {
    const error = new Error('noteWindowId is required');
    const params = {noteWindowId: null};
    const actual$ = createTask(params);
    const expected$ = m.cold('#', null, error);
    m.expect(actual$).toBeObservable(expected$);
  }));
});
