const {expect} = require('chai');
// const sinon = require('sinon');
// const {marbles} = require('rxjs-marbles/mocha');

const app = require('./app');

describe('app', () => {
  it('should export a start function', () => {
    expect(app.start).to.be.a('function');
  });
});
