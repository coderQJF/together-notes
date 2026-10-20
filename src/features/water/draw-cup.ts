import type { WaterMood } from '../../services/water-mood'

// Only the Canvas API shared by App/H5 and WeChat is used here.
export function drawCup(ctx: any, cups: number, mood: WaterMood, waterY: number, t: number, kick: number) {
  const path = (points: Array<Array<number | string>>, fill?: any, stroke?: string, width = 2.4) => {
    ctx.beginPath()
    for (const [command, ...args] of points) {
      if (command === 'M') ctx.moveTo(...args)
      if (command === 'L') ctx.lineTo(...args)
      if (command === 'Q') ctx.quadraticCurveTo(...args)
      if (command === 'C') ctx.bezierCurveTo(...args)
      if (command === 'Z') ctx.closePath()
    }
    if (fill) { ctx.setFillStyle(fill); ctx.fill() }
    if (stroke) { ctx.setStrokeStyle(stroke); ctx.setLineWidth(width); ctx.stroke() }
  }
  const ellipse = (x: number, y: number, rx: number, ry: number, fill?: any, stroke?: string) => {
    const k = .5522848
    path([['M', x + rx, y], ['C', x + rx, y + ry*k, x + rx*k, y + ry, x, y + ry], ['C', x - rx*k, y + ry, x - rx, y + ry*k, x - rx, y], ['C', x - rx, y - ry*k, x - rx*k, y - ry, x, y - ry], ['C', x + rx*k, y - ry, x + rx, y - ry*k, x + rx, y], ['Z']], fill, stroke)
  }
  const body: Array<Array<number | string>> = [['M',42,55],['Q',120,72,198,55],['L',180,230],['Q',177,249,120,250],['Q',63,249,60,230],['Z']]
  ctx.setLineCap('round'); ctx.setLineJoin('round')
  ellipse(120,258,82,8,'rgba(155,145,106,.12)')
  if (cups >= 4) ellipse(120,258,94 + Math.sin(t*2)*2,8,'rgba(131,192,201,.52)')
  ctx.save()
  ctx.translate(120,225)
  const idle = mood === 'dry' ? -.025 + Math.sin(t*2)*.012 : 0
  ctx.rotate(idle + Math.sin(kick*16) * kick * .09)
  const full = mood === 'stuffed' ? 1.02 + Math.sin(t*4)*.015 : 1
  ctx.scale(full, 1); ctx.translate(-120,-225)
  const glass = ctx.createLinearGradient(42,70,198,120)
  glass.addColorStop(0,'rgba(255,255,255,.95)'); glass.addColorStop(.5,'rgba(247,247,239,.3)'); glass.addColorStop(1,'rgba(255,255,255,.8)')
  path(body,glass,'#bdc5b6')
  ctx.save(); path(body); ctx.clip()
  const a = 3 + kick*10, b = Math.sin(t*2.6)*a
  path([['M',30,waterY-b-5],['Q',75,waterY+9+a,120,waterY-4],['Q',165,waterY-14-a,210,waterY+b-6],['L',210,270],['L',30,270],['Z']],'#b9e1e2')
  const water = ctx.createLinearGradient(80,60,140,250)
  water.addColorStop(0,'#a7d9dc'); water.addColorStop(1,'#6cb6c5')
  path([['M',30,waterY+b],['Q',75,waterY-10-a,120,waterY],['Q',165,waterY+10+a,210,waterY-b],['L',210,270],['L',30,270],['Z']],water)
  path([['M',55,60],['L',72,228]],undefined,'rgba(255,255,255,.55)',7)
  path([['M',184,79],['L',170,219]],undefined,'rgba(255,255,255,.28)',3)
  if (cups) for (const [x,y,r] of [[81,217,3],[159,199,4],[150,222,2]]) ellipse(x,y-Math.sin(t*2+x)*4,r,r,'rgba(233,250,249,.65)')
  ctx.restore()
  ellipse(120,54,78,15,'rgba(255,252,244,.58)','#bcc3b5')
  ellipse(120,54,67,9,undefined,'#e3e5d9')
  path([['M',42,58],['L',60,229],['Q',63,249,120,250],['Q',177,249,180,229],['L',198,58]],undefined,'#b6bfb2')
  const face = (p: Array<Array<number | string>>, fill?: string, color = '#426c6c', width = 3) => path(p,fill,color,width)
  if (mood === 'dry') {
    face([['M',87,181],['L',105,185],['M',135,185],['L',153,181],['M',109,202],['L',115,199],['L',120,203],['L',125,199],['L',131,202]])
    face([['M',87,174],['L',102,177],['M',138,177],['L',153,174]],undefined,'#426c6c',2)
    face([['M',76,169],['L',81,174],['L',77,178],['M',163,168],['L',159,174],['L',164,179],['M',99,211],['L',96,216],['L',100,220]],undefined,'#bbaa83',1.5)
  } else if (mood === 'waking') {
    face([['M',93,180],['L',93,184],['M',147,180],['L',147,184]])
    ellipse(120,198,4,5,undefined,'#426c6c')
    face([['M',86,172],['L',101,169],['M',139,169],['L',154,172]],undefined,'#426c6c',2)
  } else if (mood === 'happy') {
    face([['M',85,183],['Q',94,170,103,183],['M',137,183],['Q',146,170,155,183]])
    face([['M',106,194],['Q',120,219,134,194],['Z']],'#efb8a0')
    face([['M',74,165],['L',77,158],['M',164,164],['L',168,158]],undefined,'#d2b56b',2)
  } else if (mood === 'satisfied') {
    face([['M',84,181],['Q',94,194,104,181],['M',136,181],['Q',146,194,156,181]])
    face([['M',109,196],['Q',120,208,131,196]])
  } else if (mood === 'stuffed') {
    face([['M',86,178],['L',98,185],['L',86,191],['M',154,178],['L',142,185],['L',154,191]])
    face([['M',113,201],['Q',120,196,127,201],['M',114,207],['L',126,207]])
    face([['M',74,189],['Q',64,200,77,206],['M',163,189],['Q',173,200,160,206]],undefined,'#426c6c',2.3)
    path([['M',165,164],['Q',158,174,165,175],['Q',172,174,165,164]],'#8acbd4')
  } else {
    face([['M',85,173],['L',101,178],['M',139,178],['L',155,173],['M',94,182],['L',94,187],['M',146,182],['L',146,187]])
    face([['M',110,203],['Q',120,191,130,203]])
    path([['M',82,190],['Q',77,198,82,199],['Q',87,198,82,190]],'#8acbd4')
  }
  const cheek = cups >= 4 ? 12 : 4 + Math.min(cups/3,1)*5
  ellipse(87,193,cheek,cups>=4?8:4,cups?'rgba(247,189,171,.78)':'rgba(247,189,171,.12)')
  ellipse(153,193,cheek,cups>=4?8:4,cups?'rgba(247,189,171,.78)':'rgba(247,189,171,.12)')
  path([['M',63,84],['L',69,130]],undefined,'rgba(255,255,255,.9)',5)
  if (cups >= 4) {
    const drift = Math.sin(t*6)*2
    path([['M',39,53],['Q',34,72,43,90],['L',50,151+drift],['Q',52,160+drift,57,152+drift],['L',50,84],['Q',47,64,53,57],['Z']],'#88c6cf')
    path([['M',186,55],['Q',195,49,202,57],['Q',209,69,200,93],['L',191,177-drift],['Q',189,187-drift,184,179-drift],['L',191,92],['Q',197,69,186,64],['Z']],'#88c6cf')
  }
  ctx.restore()
}
