import burza from '@/data/survival/text/burza-badz-bezpieczny.md';
import biologiczne from '@/data/survival/text/cbrne-zagrozenie-biologiczne.md';
import chemiczne from '@/data/survival/text/cbrne-zagrozenie-chemiczne.md';
import eksplozja from '@/data/survival/text/cbrne-zagrozenie-eksplozja.md';
import jadrowe from '@/data/survival/text/cbrne-zagrozenie-jadrowe.md';
import radiacyjne from '@/data/survival/text/cbrne-zagrozenie-radiacyjne.md';
import czad from '@/data/survival/text/czad-nie-dla-czadu.md';
import gazUlatnia from '@/data/survival/text/gaz-co-robic-gdy-ulatnia-sie.md';
import gazWDomu from '@/data/survival/text/gaz-w-domu.md';
import pozar from '@/data/survival/text/pozar-badz-bezpieczny.md';
import pozarLasu from '@/data/survival/text/pozar-lasu-jak-sie-zachowac.md';
import pozarLasuZgloszenie from '@/data/survival/text/pozar-lasu-zagrozenie-pozarowe.md';
import stopnieAlarmowe from '@/data/survival/text/stopnie-alarmowe.md';
import upal from '@/data/survival/text/upal-jak-przetrwac.md';
import wichura from '@/data/survival/text/wichura-jak-sie-przygotowac.md';
import woda from '@/data/survival/text/woda-badz-bezpieczny.md';
import zima from '@/data/survival/text/zima-bezpieczna.md';
import { readBundledText } from '@/services/bundled-text';
import { parseGuide, type GuideBlock } from '@/services/guide-text';

export type LibraryTopic = { id: string; title: string; url: `https://${string}`; text: number };

// The same gov.pl pages the chat answers from (scripts/rag/sources.json, type "web").
export const LIBRARY_GROUPS: { title: string; topics: LibraryTopic[] }[] = [
  {
    title: 'Pogoda i żywioły',
    topics: [
      { id: 'burza', title: 'Burza – bądź bezpieczny', url: 'https://www.gov.pl/web/rcb/burza--badz-bezpieczny', text: burza },
      { id: 'wichura', title: 'Wichura – jak się przygotować', url: 'https://www.gov.pl/web/rcb/wichura--jak-sie-przygotowac', text: wichura },
      { id: 'upal', title: 'Jak przetrwać upał?', url: 'https://www.gov.pl/web/rcb/jak-przetrwac-upal2', text: upal },
      { id: 'zima', title: 'Bezpieczna zima', url: 'https://www.gov.pl/web/rcb/bezpieczna-zima2', text: zima },
      { id: 'pozar', title: 'Pożar – bądź bezpieczny', url: 'https://www.gov.pl/web/rcb/pozar--badz-bezpieczny6', text: pozar },
      { id: 'pozar-lasu', title: 'Fale upałów i zagrożenie pożarowe w lasach', url: 'https://www.gov.pl/web/klimat/fale-upalow-i-zagrozenie-pozarowe-w-lasach-sluzby-apeluja-o-ostroznosc', text: pozarLasu },
      { id: 'pozar-lasu-zgloszenie', title: 'Zagrożenie pożarowe lasów', url: 'https://www.gov.pl/web/kppsp-ketrzyn/zagrozenie-pozarowe-lasow', text: pozarLasuZgloszenie },
      { id: 'woda', title: 'Bądź bezpieczny nad wodą', url: 'https://www.gov.pl/web/rcb/badz-bezpieczny-nad-woda2', text: woda },
    ],
  },
  {
    title: 'Skażenia i wybuchy',
    topics: [
      { id: 'chemiczne', title: 'Zagrożenia chemiczne', url: 'https://www.gov.pl/web/rcb/zagrozenia-chemiczne', text: chemiczne },
      { id: 'biologiczne', title: 'Zagrożenia biologiczne', url: 'https://www.gov.pl/web/rcb/zagrozenia-biologiczne', text: biologiczne },
      { id: 'radiacyjne', title: 'Zagrożenia radiacyjne', url: 'https://www.gov.pl/web/rcb/zagrozenia-radiacyjne', text: radiacyjne },
      { id: 'jadrowe', title: 'Zagrożenie jądrowe', url: 'https://www.gov.pl/web/rcb/zagrozenie-jadrowe', text: jadrowe },
      { id: 'eksplozja', title: 'Zagrożenie eksplozją', url: 'https://www.gov.pl/web/rcb/zagrozenie-eksplozja', text: eksplozja },
    ],
  },
  {
    title: 'Dom i alarmy',
    topics: [
      { id: 'czad', title: 'Nie dla czadu', url: 'https://www.gov.pl/web/rcb/nie-dla-czadu2', text: czad },
      { id: 'gaz-ulatnia', title: 'Co robić gdy ulatnia się gaz?', url: 'https://www.gov.pl/web/kppsp-turek/co-robic-gdy-ulatnia-sie-gaz', text: gazUlatnia },
      { id: 'gaz-w-domu', title: 'Gaz w domu', url: 'https://www.gov.pl/web/kwpsp-opole/prewencja-spoleczna-porady-gaz-w-domu', text: gazWDomu },
      { id: 'stopnie-alarmowe', title: 'Stopnie alarmowe', url: 'https://www.gov.pl/web/rcb/stopnie-alarmowe2', text: stopnieAlarmowe },
    ],
  },
];

export function findTopic(id: string) {
  return LIBRARY_GROUPS.flatMap((group) => group.topics).find((topic) => topic.id === id);
}

export async function loadGuide(topic: LibraryTopic): Promise<GuideBlock[]> {
  return parseGuide(await readBundledText(topic.text));
}
