const {expect} = require('chai');
const sinon = require('sinon');
const {marbles} = require('rxjs-marbles/mocha');
const {of} = require('rxjs');

const toQAPipeline = require('./toQAPipeline');

describe('toQAPipeline', () => {
  it('should export a function', () => {
    expect(toQAPipeline).to.be.a('function');
    expect(toQAPipeline({})).to.be.a('function');
  });

  it('should produce valid output given valid input', marbles(m => {
    const string = 'Hi. What brings you in today? I have a headache. It started three days ago.';
    const verifiedFinding = {
      runId: 'myrun',
      noteWindowId: 'mynotewindow',
      pipelineId: 'mypipeline',
      findingCode: 'F-HpiOnset',
      findingAttributes: [
        {
          findingAttributeCode: 'F-HpiOnset-time',
          findingAttributeKey: 'time',
          findingAttributeScore: 0.85,
          stringValues: ['three days ago'],
        }
      ],
    };
    const params = {
      runId: 'myrun',
      noteWindowId: 'mynotewindow',
      pipelineId: 'mypipeline',
      _gql: sinon.stub().returns({
        findFindingAttributes: sinon.stub().returns(m.cold(
          '-(0|)',
          [{
            findingAttributes: [
              {code: 'F-HpiOnset-time', findingCode: 'F-HpiOnset', key: 'time'},
            ]
          }]
        )),
      }),
      _sendWordsToQAModel: () => sinon.stub().returns(
        m.cold(
          '-(0|)',
          [[{
            findingAttribute: {
              code: 'F-HpiOnset-time',
              findingCode: 'F-HpiOnset',
              key: 'time',
            },
            text: 'three days ago',
          }]]
        )
      ),
      _sendWordsToTopicModel: () => sinon.stub().returns(
        m.cold('(0|)', [[{label: 'F-HpiOnset-time', score: 0.8250104188919067}]])
      ),
    };
    const input$ = m.cold('--(0|)', [string]);
    const actual$ = input$.pipe(toQAPipeline(params));
    const expected$ = m.cold('----(0|)', [[verifiedFinding]]);
    m.expect(actual$).toBeObservable(expected$);
  }));
});
