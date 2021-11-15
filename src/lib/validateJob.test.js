const {expect} = require('chai');
// const sinon  = require('sinon');
const {marbles} = require('rxjs-marbles/mocha');

const validateJob  = require('./validateJob');

const exampleJob = {
  noteWindowId: 'foobarid',
  runId: 'foobarid',
  practitionerId: 'foobarid',
};

describe('validateJob', () => {
  it('should export a curried function', () => {
    expect(validateJob).to.be.a('function');
    expect(validateJob()).to.be.a('function');
  });

  it('should return an error observable when job is invalid', marbles(m => {
    const actual$ = validateJob()({...exampleJob, noteWindowId: null});
    const expected$ = m.cold('#', null, new Error('ValidationError: child "noteWindowId" fails because ["noteWindowId" must be a string]'));
    m.expect(actual$).toBeObservable(expected$);
  }));

  it('should return an observable with the job when job is valid', marbles(m => {
    const actual$ = validateJob()(exampleJob);
    const expected$ = m.cold('(0|)', [exampleJob]);
    m.expect(actual$).toBeObservable(expected$);
  }));
});
