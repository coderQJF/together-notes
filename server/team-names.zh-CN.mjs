const normalize = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const entries = [
  ['阿森纳', ['Arsenal', 'Arsenal FC', 'ARS']],
  ['阿斯顿维拉', ['Aston Villa', 'Aston Villa FC', 'AVL']],
  ['伯恩茅斯', ['AFC Bournemouth', 'Bournemouth', 'BOU']],
  ['布伦特福德', ['Brentford', 'Brentford FC', 'BRE']],
  ['布莱顿', ['Brighton', 'Brighton & Hove Albion', 'Brighton & Hove Albion FC', 'BHA']],
  ['伯恩利', ['Burnley', 'Burnley FC', 'BUR']],
  ['切尔西', ['Chelsea', 'Chelsea FC', 'CHE']],
  ['水晶宫', ['Crystal Palace', 'Crystal Palace FC', 'CRY']],
  ['埃弗顿', ['Everton', 'Everton FC', 'EVE']],
  ['富勒姆', ['Fulham', 'Fulham FC', 'FUL']],
  ['利兹联', ['Leeds United', 'Leeds United FC', 'LEE']],
  ['利物浦', ['Liverpool', 'Liverpool FC', 'LIV']],
  ['曼城', ['Manchester City', 'Manchester City FC', 'Man City', 'MCI']],
  ['曼联', ['Manchester United', 'Manchester United FC', 'Man United', 'MUN']],
  ['纽卡斯尔联', ['Newcastle United', 'Newcastle United FC', 'Newcastle', 'NEW']],
  ['诺丁汉森林', ['Nottingham Forest', 'Nottingham Forest FC', 'NFO']],
  ['桑德兰', ['Sunderland', 'Sunderland AFC', 'SUN']],
  ['热刺', ['Tottenham Hotspur', 'Tottenham Hotspur FC', 'Tottenham', 'Spurs', 'TOT']],
  ['西汉姆联', ['West Ham United', 'West Ham United FC', 'West Ham', 'WHU']],
  ['狼队', ['Wolverhampton Wanderers', 'Wolverhampton Wanderers FC', 'Wolves', 'WOL']],
  ['莱斯特城', ['Leicester City', 'Leicester City FC', 'LEI']],
  ['南安普敦', ['Southampton', 'Southampton FC', 'SOU']],
  ['谢菲尔德联', ['Sheffield United', 'Sheffield United FC', 'SHU']],
  ['伊普斯维奇', ['Ipswich Town', 'Ipswich Town FC', 'IPS']],
  ['米德尔斯堡', ['Middlesbrough', 'Middlesbrough FC', 'MID']],
  ['考文垂', ['Coventry City', 'Coventry City FC', 'COV']],
  ['诺维奇', ['Norwich City', 'Norwich City FC', 'NOR']],
  ['西布朗', ['West Bromwich Albion', 'West Bromwich Albion FC', 'WBA']],
  ['沃特福德', ['Watford', 'Watford FC', 'WAT']],
  ['伯明翰城', ['Birmingham City', 'Birmingham City FC', 'BIR']],

  ['巴塞罗那', ['FC Barcelona', 'Barcelona', 'BAR']],
  ['皇家马德里', ['Real Madrid', 'Real Madrid CF', 'RMA']],
  ['马德里竞技', ['Atletico Madrid', 'Atlético Madrid', 'Club Atlético de Madrid', 'ATM']],
  ['毕尔巴鄂竞技', ['Athletic Club', 'Athletic Bilbao', 'ATH']],
  ['比利亚雷亚尔', ['Villarreal', 'Villarreal CF', 'VIL']],
  ['皇家贝蒂斯', ['Real Betis', 'Real Betis Balompié', 'BET']],
  ['皇家社会', ['Real Sociedad', 'Real Sociedad de Fútbol', 'RSO']],
  ['塞维利亚', ['Sevilla', 'Sevilla FC', 'SEV']],
  ['瓦伦西亚', ['Valencia', 'Valencia CF', 'VAL']],
  ['赫罗纳', ['Girona', 'Girona FC', 'GIR']],
  ['塞尔塔', ['Celta Vigo', 'RC Celta de Vigo', 'Celta de Vigo', 'CEL']],
  ['赫塔费', ['Getafe', 'Getafe CF', 'GET']],
  ['西班牙人', ['Espanyol', 'RCD Espanyol', 'RCD Espanyol de Barcelona', 'ESP']],
  ['奥萨苏纳', ['Osasuna', 'CA Osasuna', 'OSA']],
  ['马略卡', ['Mallorca', 'RCD Mallorca', 'MAL']],
  ['巴列卡诺', ['Rayo Vallecano', 'Rayo Vallecano de Madrid', 'RAY']],
  ['阿拉维斯', ['Alavés', 'Deportivo Alavés', 'ALA']],
  ['埃尔切', ['Elche', 'Elche CF', 'ELC']],
  ['莱万特', ['Levante', 'Levante UD', 'LEV']],
  ['皇家奥维耶多', ['Real Oviedo', 'OVI']],
  ['拉斯帕尔马斯', ['UD Las Palmas', 'Las Palmas', 'LPA']],
  ['巴拉多利德', ['Real Valladolid', 'Real Valladolid CF', 'VLL']],
  ['莱加内斯', ['CD Leganés', 'Leganés', 'LEG']],

  ['拜仁慕尼黑', ['Bayern München', 'Bayern Munich', 'FC Bayern München', 'FC Bayern Munich', 'BAY']],
  ['多特蒙德', ['Borussia Dortmund', 'Dortmund', 'BVB']],
  ['勒沃库森', ['Bayer 04 Leverkusen', 'Bayer Leverkusen', 'Leverkusen', 'B04']],
  ['莱比锡', ['RB Leipzig', 'Leipzig', 'RBL']],
  ['法兰克福', ['Eintracht Frankfurt', 'Frankfurt', 'SGE']],
  ['斯图加特', ['VfB Stuttgart', 'Stuttgart', 'VFB']],
  ['沃尔夫斯堡', ['VfL Wolfsburg', 'Wolfsburg', 'WOB']],
  ['巴黎圣日耳曼', ['Paris Saint-Germain', 'Paris Saint Germain', 'PSG']],
  ['马赛', ['Olympique de Marseille', 'Marseille', 'OM']],
  ['摩纳哥', ['AS Monaco', 'Monaco', 'ASM']],
  ['里尔', ['Lille OSC', 'Lille', 'LIL']],
  ['里昂', ['Olympique Lyonnais', 'Lyon', 'OL']],
  ['国际米兰', ['Internazionale', 'Inter Milan', 'FC Internazionale Milano', 'Inter', 'INT']],
  ['AC米兰', ['AC Milan', 'Milan', 'ACM']],
  ['尤文图斯', ['Juventus', 'Juventus FC', 'JUV']],
  ['那不勒斯', ['Napoli', 'SSC Napoli', 'NAP']],
  ['亚特兰大', ['Atalanta', 'Atalanta BC', 'ATA']],
  ['罗马', ['AS Roma', 'Roma', 'ROM']],
  ['拉齐奥', ['SS Lazio', 'Lazio', 'LAZ']],
  ['博洛尼亚', ['Bologna', 'Bologna FC 1909', 'BOL']],
  ['佛罗伦萨', ['ACF Fiorentina', 'Fiorentina', 'FIO']],
  ['本菲卡', ['SL Benfica', 'Benfica', 'BEN']],
  ['波尔图', ['FC Porto', 'Porto', 'POR']],
  ['葡萄牙体育', ['Sporting CP', 'Sporting Clube de Portugal', 'Sporting Lisbon', 'SCP']],
  ['布拉加', ['SC Braga', 'Braga', 'BRA']],
  ['阿贾克斯', ['Ajax', 'AFC Ajax', 'AJA']],
  ['埃因霍温', ['PSV', 'PSV Eindhoven']],
  ['费耶诺德', ['Feyenoord', 'FEY']],
  ['布鲁日', ['Club Brugge', 'Club Brugge KV', 'BRU']],
  ['圣吉罗斯联合', ['Union Saint-Gilloise', 'Royale Union Saint-Gilloise', 'USG']],
  ['安德莱赫特', ['RSC Anderlecht', 'Anderlecht', 'AND']],
  ['凯尔特人', ['Celtic', 'Celtic FC', 'CELT']],
  ['格拉斯哥流浪者', ['Rangers', 'Rangers FC', 'RAN']],
  ['奥林匹亚科斯', ['Olympiacos', 'Olympiacos FC', 'OLY']],
  ['加拉塔萨雷', ['Galatasaray', 'Galatasaray SK', 'GAL']],
  ['费内巴切', ['Fenerbahçe', 'Fenerbahce', 'FEN']],
  ['萨尔茨堡红牛', ['Red Bull Salzburg', 'FC Salzburg', 'Salzburg', 'RBS']],
  ['顿涅茨克矿工', ['Shakhtar Donetsk', 'FC Shakhtar Donetsk', 'SHK']],
  ['基辅迪纳摩', ['Dynamo Kyiv', 'Dynamo Kiev', 'DKY']],
  ['布拉格斯拉维亚', ['Slavia Praha', 'Slavia Prague', 'SLA']],
  ['布拉格斯巴达', ['Sparta Praha', 'Sparta Prague', 'SPA']],
  ['哥本哈根', ['FC Copenhagen', 'FC København', 'Copenhagen', 'FCK']],
  ['博德闪耀', ['Bodø/Glimt', 'Bodo/Glimt', 'Bodø Glimt', 'Bodo Glimt', 'BOD']],
  ['贝尔格莱德红星', ['Red Star Belgrade', 'Crvena zvezda', 'RSB']],
  ['萨格勒布迪纳摩', ['Dinamo Zagreb', 'GNK Dinamo Zagreb', 'DIN']],
  ['伯尔尼年轻人', ['BSC Young Boys', 'Young Boys', 'YB']],
  ['卡拉巴赫', ['Qarabağ FK', 'Qarabag FK', 'QAR']],
  ['阿拉木图凯拉特', ['Kairat Almaty', 'FC Kairat', 'KAI']],
  ['帕福斯', ['Pafos FC', 'Pafos', 'PAF']],
  ['特拉维夫马卡比', ['Maccabi Tel Aviv', 'MTA']],
  ['费伦茨瓦罗斯', ['Ferencváros', 'Ferencvaros', 'FTC']],
  ['马尔默', ['Malmö FF', 'Malmo FF', 'MFF']]
];

const names = new Map();
for (const [zh, aliases] of entries) {
  const localized = Object.freeze({ name: zh, shortName: zh });
  for (const alias of aliases) names.set(normalize(alias), localized);
}

export function footballTeamNameZh(team = {}) {
  for (const value of [team.tla, team.name, team.shortName]) {
    const localized = names.get(normalize(value));
    if (localized) return localized;
  }
  return null;
}
