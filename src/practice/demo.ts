export const scaleKeys = [
  { label: 'ハ長調 (C)', tonic: 'C', fifths: 0 },
  { label: 'ト長調 (G)', tonic: 'G', fifths: 1 },
  { label: 'ニ長調 (D)', tonic: 'D', fifths: 2 },
  { label: 'イ長調 (A)', tonic: 'A', fifths: 3 },
  { label: 'ヘ長調 (F)', tonic: 'F', fifths: -1 },
  { label: '変ロ長調 (B♭)', tonic: 'B', fifths: -2 },
  { label: '変ホ長調 (E♭)', tonic: 'E', fifths: -3 },
] as const;

export function makeScaleDemo(key: (typeof scaleKeys)[number]) {
  const steps = 'CDEFGAB';
  const accidentals = (key.fifths < 0 ? 'BEADGCF' : 'FCGDAEB').slice(
    0,
    Math.abs(key.fifths),
  );
  const tonic = steps.indexOf(key.tonic);
  const bars = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [7, 6, 5, 4],
    [3, 2, 1, 0],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>音階練習：${key.label}</work-title></work>
  <part-list><score-part id="P1"><part-name>オタマトーン</part-name></score-part></part-list>
  <part id="P1">
    ${bars
      .map(
        (bar, i) => `<measure number="${i + 1}">
      ${
        i === 0
          ? `<attributes><divisions>1</divisions><key><fifths>${key.fifths}</fifths><mode>major</mode></key>
      <time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>
      <per-minute>60</per-minute></metronome></direction-type><sound tempo="60"/></direction>`
          : ''
      }
      ${bar
        .map((degree) => {
          const index = tonic + degree;
          const step = steps.charAt(index % steps.length);
          const alter = accidentals.includes(step)
            ? `<alter>${Math.sign(key.fifths)}</alter>`
            : '';
          return `<note><pitch><step>${step}</step>${alter}<octave>${4 + Math.floor(index / 7)}</octave></pitch><duration>1</duration><type>quarter</type></note>`;
        })
        .join('')}
    </measure>`,
      )
      .join('')}
  </part>
</score-partwise>`;
}
