const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} = require('rxjs-marbles/mocha');

const config = require('./config');

describe('config', () => {
  it('should export a function', () => {
    expect(config).to.be.a('function');
  });
});
