const {expect} = require('chai');
const sinon = require('sinon');
const {marbles} = require('rxjs-marbles/mocha');

const sendOpenAIRequest = require('./sendOpenAIRequest');

describe('sendOpenAIRequest', () => {
  it('should export a function', () => {
    expect(sendOpenAIRequest).to.be.a('function');
  });

  it('should return correct output given valid input', marbles(m => {
    const fakeResponse = {
      data: {
        choices: [{text: 'foobar'}]
      }
    };
    const params = {
      prompt: 'here\'s Jonny!',
      _openai: sinon.stub().returns({
        createCompletion: sinon.stub().returns([fakeResponse])
      })
    };
    const actual$ = sendOpenAIRequest(params);
    const expected$ = m.cold('(0|)', [{text: 'foobar'}]);
    m.expect(actual$).toBeObservable(expected$);
  }));
});
