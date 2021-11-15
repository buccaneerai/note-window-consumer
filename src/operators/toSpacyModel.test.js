const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} = require('rxjs-marbles/mocha');

const toSpacyModel = require('./toSpacyModel');

describe('toSpacyModel', () => {
  it('should export a curried function', () => {
    expect(toSpacyModel).to.be.a('function');
    expect(toSpacyModel()).to.be.a('function');
  });

  it('should convert words into spacy predictions', () => {
    expect(false).to.be.true;
  });
});
