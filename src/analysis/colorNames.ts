import { hexToRgb, rgbToOklab, type Lab, type RGB } from '../engine/color'
import type { Messages } from '../i18n/locales/en'

/** Colour name ids – display names live in the i18n catalogs (`colors.*`). */
export type ColorNameId = keyof Messages['colors']

/** A painterly colour vocabulary: pigment names mixed with familiar everyday names. */
const NAMES: Array<[Exclude<ColorNameId, 'paper'>, string]> = [
  ['white', '#ffffff'],
  ['ivory', '#fffff0'],
  ['linen', '#faf0e6'],
  ['cream', '#fffdd0'],
  ['paleBlue', '#d3e2f1'],
  ['iceBlue', '#e3edf5'],
  ['paleGreen', '#d6e9d2'],
  ['seafoam', '#cdeae1'],
  ['palePink', '#f6d9df'],
  ['palePeach', '#f8e1cf'],
  ['paleYellow', '#faf1c2'],
  ['paleLilac', '#e4dcf0'],
  ['lightBlueGray', '#c4d2df'],
  ['blueGray', '#8ea3b8'],
  ['lightSteelBlue', '#b0c4de'],
  ['sageGray', '#b3bdab'],
  ['mushroom', '#bdb1a3'],
  ['silver', '#c0c0c0'],
  ['lightGray', '#d3d3d3'],
  ['gray', '#808080'],
  ['warmGray', '#8b8178'],
  ['slateGray', '#708090'],
  ['paynesGray', '#536878'],
  ['davyGray', '#555555'],
  ['charcoal', '#36454f'],
  ['graphite', '#383838'],
  ['lampBlack', '#2b2b2b'],
  ['ivoryBlack', '#231f20'],
  ['black', '#000000'],
  ['cadmiumRed', '#e30022'],
  ['crimson', '#dc143c'],
  ['alizarinCrimson', '#b0263b'],
  ['scarlet', '#ff2400'],
  ['vermilion', '#e34234'],
  ['carmine', '#960018'],
  ['maroon', '#800000'],
  ['burgundy', '#800020'],
  ['brickRed', '#cb4154'],
  ['indianRed', '#cd5c5c'],
  ['coral', '#ff7f50'],
  ['salmon', '#fa8072'],
  ['rose', '#ff007f'],
  ['pink', '#ffc0cb'],
  ['blush', '#de5d83'],
  ['hotPink', '#ff69b4'],
  ['magenta', '#ff00ff'],
  ['quinacridoneRose', '#c2185b'],
  ['peach', '#ffcba4'],
  ['apricot', '#fbceb1'],
  ['cadmiumOrange', '#ed872d'],
  ['orange', '#ffa500'],
  ['tangerine', '#f28500'],
  ['burntOrange', '#cc5500'],
  ['amber', '#ffbf00'],
  ['cadmiumYellow', '#fff600'],
  ['lemonYellow', '#fff44f'],
  ['yellow', '#ffff00'],
  ['naplesYellow', '#fada5e'],
  ['gold', '#ffd700'],
  ['mustard', '#e1ad01'],
  ['yellowOchre', '#cb9d06'],
  ['rawSienna', '#d68a59'],
  ['burntSienna', '#e97451'],
  ['terracotta', '#e2725b'],
  ['rawUmber', '#826644'],
  ['burntUmber', '#8a3324'],
  ['sepia', '#704214'],
  ['vanDykeBrown', '#664228'],
  ['chocolate', '#7b3f00'],
  ['coffee', '#6f4e37'],
  ['caramel', '#af6e4d'],
  ['tan', '#d2b48c'],
  ['beige', '#f5f5dc'],
  ['khaki', '#c3b091'],
  ['sand', '#c2b280'],
  ['sapGreen', '#507d2a'],
  ['olive', '#808000'],
  ['oliveDrab', '#6b8e23'],
  ['mossGreen', '#8a9a5b'],
  ['sage', '#a3b18a'],
  ['pistachio', '#93c572'],
  ['chartreuse', '#7fff00'],
  ['lime', '#32cd32'],
  ['mint', '#98ff98'],
  ['springGreen', '#00ff7f'],
  ['emerald', '#50c878'],
  ['jade', '#00a86b'],
  ['forestGreen', '#228b22'],
  ['hookersGreen', '#49796b'],
  ['viridian', '#40826d'],
  ['pineGreen', '#01796f'],
  ['phthaloGreen', '#123524'],
  ['teal', '#008080'],
  ['turquoise', '#40e0d0'],
  ['aqua', '#00ffff'],
  ['powderBlue', '#b0e0e6'],
  ['skyBlue', '#87ceeb'],
  ['babyBlue', '#89cff0'],
  ['cerulean', '#007ba7'],
  ['azure', '#007fff'],
  ['cornflower', '#6495ed'],
  ['steelBlue', '#4682b4'],
  ['denim', '#1560bd'],
  ['royalBlue', '#4169e1'],
  ['cobaltBlue', '#0047ab'],
  ['ultramarine', '#2a3fb8'],
  ['phthaloBlue', '#000f89'],
  ['prussianBlue', '#003153'],
  ['navy', '#000080'],
  ['midnightBlue', '#191970'],
  ['periwinkle', '#ccccff'],
  ['indigo', '#4b0082'],
  ['violet', '#8f00ff'],
  ['dioxazinePurple', '#4b2a6b'],
  ['purple', '#800080'],
  ['amethyst', '#9966cc'],
  ['lavender', '#b57edc'],
  ['lilac', '#c8a2c8'],
  ['mauve', '#e0b0ff'],
  ['orchid', '#da70d6'],
  ['plum', '#8e4585'],
  ['eggplant', '#614051'],
]

export const COLOR_NAME_IDS: ColorNameId[] = ['paper', ...NAMES.map(([id]) => id)]

const TABLE: Array<{ id: Exclude<ColorNameId, 'paper'>; lab: Lab }> = NAMES.map(([id, hex]) => ({
  id,
  lab: rgbToOklab(hexToRgb(hex)),
}))

/** Closest named colour – matched on hue/chroma first, like people name colours. */
export function nameColor(rgb: RGB, lab: Lab = rgbToOklab(rgb)): Exclude<ColorNameId, 'paper'> {
  let best = TABLE[0]
  let bestD = Infinity
  for (const e of TABLE) {
    const dl = (lab[0] - e.lab[0]) * 0.65
    const da = lab[1] - e.lab[1]
    const db = lab[2] - e.lab[2]
    const d = dl * dl + da * da + db * db
    if (d < bestD) {
      bestD = d
      best = e
    }
  }
  return best.id
}
