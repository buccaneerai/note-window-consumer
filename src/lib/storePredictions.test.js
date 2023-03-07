const {expect} = require('chai');
const sinon = require('sinon');
const {marbles} = require('rxjs-marbles/mocha');
const {of} = require('rxjs');
const {tap} = require('rxjs/operators');

const storePredictions = require('./storePredictions');

describe('storePredictions', () => {
  it('should export a function', () => {
    expect(storePredictions).to.be.a('function');
  });

  it('should return an array if no predictions are given', marbles(m => {
    const actual$ = storePredictions()({predictions: []});
    const expected$ = m.cold('(0|)', [[]]);
    m.expect(actual$).toBeObservable(expected$);
  }));

  it('should parse valid predictions', (done) => {
    const _onData = sinon.spy();
    const _createVerifiedFinding = sinon.stub().returns(of({_id: 'verifiedFinding'}));
    const params = {
      graphqlUrl: 'https://clinical-api/graphql',
      token: 'seeecret',
      _client: sinon.stub().returns({
        createFindingInstance: sinon.stub().returns(of({
          createFindingInstance: {_id: 'findingInstance'}
        })),
        createVerifiedFinding: _createVerifiedFinding,
      }),
      _logger: {
        info: sinon.spy(),
        error: sinon.spy(),
        toLog: tap,
      },
    };
    const predictions = [
      {
        findingCode: 'F-HpiOnset',
        runId: 'myrun',
        noteWindowId: 'mynotewindow',
        pipelineId: 'topic-qa-pipeline',
        findingAttributes: [{
          code: 'F-HpiOnset-time',
          findingAttributeKey: 'time',
          stringValues: ['five days ago'],
          findingAttributeScore: 0.85,
        }]
      },
      {
        findingCode: 'F-HpiQuality',
        runId: 'myrun',
        noteWindowId: 'mynotewindow',
        pipelineId: 'topic-qa-pipeline',
        findingAttributes: [{
          code: 'F-HpiQuality-text',
          findingAttributeKey: 'text',
          stringValues: ['pulsating'],
          findingAttributeScore: 0.85,
        }]
      },
      {
        findingCode: 'F-Symptom',
        runId: 'myrun',
        noteWindowId: 'mynotewindow',
        pipelineId: 'medical-comprehend',
        findingAttributes: [{
          code: 'F-Symptom-code',
          findingAttributeKey: 'code',
          findingAttributeValue: '1234567',
        },
        {
          code: 'F-Symptom-isAsserted',
          findingAttributeKey: 'isAsserted',
          findingAttributeValue: false,
        }]
      },
    ];
    const obs$ = storePredictions(params)({predictions})

    obs$.subscribe(_onData, console.error, () => {
      expect(_onData.callCount).to.equal(1);
      expect(_createVerifiedFinding.callCount).to.equal(4);
      expect(_createVerifiedFinding.getCall(0).args[0]).to.deep.equal({
        findingInstanceId: 'findingInstance',
        runId: 'myrun',
        noteWindowId: 'mynotewindow',
        pipelineId: 'topic-qa-pipeline',
        findingCode: 'F-HpiOnset',
        findingType: 'predicted',
        findingAttributeKey: 'time',
        findingAttributeDescription: '',
        findingAttributeScore: 0.85,
        stringValues: ['five days ago'],
      });
      expect(_createVerifiedFinding.getCall(2).args[0]).to.deep.equal({
        findingInstanceId: 'findingInstance',
        runId: 'myrun',
        noteWindowId: 'mynotewindow',
        pipelineId: 'medical-comprehend',
        findingCode: 'F-Symptom',
        findingType: 'predicted',
        findingAttributeKey: 'code',
        findingAttributeDescription: '',
        findingAttributeScore: 0.5,
        codeValues: ['1234567'],
      });
      done();
    });
  });
});
