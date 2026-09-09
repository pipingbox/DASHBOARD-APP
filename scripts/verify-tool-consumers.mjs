import { getStudBoltRow } from '../app/frontend/src/lib/bolting/asme-b16-5-stud-bolts.ts';

const cases = [
  ['2"', 150], ['6"', 300], ['3-1/2"', 150], ['5"', 150], ['22"', 300], ['14"', 2500]
];
for (const [nps, cls] of cases) {
  const row = getStudBoltRow(cls, nps);
  console.log(cls, nps, row ? `OK qty=${row.qty} d=${row.diaIn}"` : 'N/A');
}
