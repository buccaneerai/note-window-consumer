const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} = require('rxjs-marbles/mocha');

const toInfoRetrievalModel = require('./toInfoRetrievalModel');

describe('toInfoRetrievalModel', () => {
  it('should export a curried function', () => {
    expect(toInfoRetrievalModel).to.be.a('function');
    expect(toInfoRetrievalModel()).to.be.a('function');
  });

  it('should convert words into spacy predictions', () => {
    expect(false).to.be.true;
  });
});
