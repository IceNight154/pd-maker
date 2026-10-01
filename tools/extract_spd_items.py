import re, os, json, sys
# 사용: python tools/extract_spd_items.py <mod-2 저장소> <원작 SPD 저장소>
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from itemsheet import parse
M=(sys.argv[1] if len(sys.argv)>1 else '/tmp/mod2')+'/core/src/main'; V=(sys.argv[2] if len(sys.argv)>2 else '/tmp/spd320')+'/core/src/main'
J='java/com/shatteredpixel/shatteredpixeldungeon'
mod2,_=parse(f'{M}/{J}/sprites/ItemSpriteSheet.java'); van,_=parse(f'{V}/{J}/sprites/ItemSpriteSheet.java')
def props(path):
    d={}
    for line in open(path,encoding='utf-8'):
        if '=' in line and not line.startswith('#'):
            k,v=line.rstrip('\n').split('=',1); d[k.strip()]=v
    return d
ko=props(f'{M}/assets/messages/items/items_ko.properties'); en=props(f'{M}/assets/messages/items/items.properties')
vanfiles=set()
for r,_,fs in os.walk(f'{V}/{J}/items'):
    for f in fs: vanfiles.add(os.path.relpath(os.path.join(r,f),f'{V}/{J}/items')[:-5])
EXCL={'Item','EquipableItem','KindOfWeapon','KindofMisc','Generator','Heap','ItemStatusHandler','Recipe','armor/Armor','armor/ClassArmor','artifacts/Artifact','bags/Bag','potions/Potion','potions/exotic/ExoticPotion','potions/brews/Brew','potions/elixirs/Elixir','scrolls/Scroll','scrolls/InventoryScroll','scrolls/exotic/ExoticScroll','spells/Spell','spells/InventorySpell','spells/TargetedSpell','stones/Runestone','stones/InventoryStone','trinkets/Trinket','wands/Wand','wands/DamageWand','wands/CursedWand','weapon/Weapon','weapon/melee/MeleeWeapon','weapon/missiles/MissileWeapon','weapon/missiles/darts/TippedDart','keys/Key','rings/Ring','remains/RemainsItem','journal/DocumentPage','weapon/codices/Codex','weapon/codices/melee/MeleeCodex','weapon/codices/ranged/RangedCodex','weapon/codices/cast/CastCodex','bags/grimoire/Grimoire'}
HOLD={'potion':'POTION_HOLDER','scroll':'SCROLL_HOLDER','ring':'RING_HOLDER','stone':'STONE_HOLDER','wand':'WAND_HOLDER','artifact':'ARTIFACT_HOLDER','food':'FOOD_HOLDER','bomb':'BOMB_HOLDER','trinket':'TRINKET_HOLDER','spell':'SPELL_HOLDER','weapon':'WEAPON_HOLDER','armor':'ARMOR_HOLDER'}
def cat(p, src):
    d=p.split('/')
    if d[0]=='weapon':
        if d[1]=='codices': return 'codex', d[2]
        if d[1]=='melee': return 'weapon','melee'
        if len(d)>2 and d[2]=='darts': return 'weapon','dart'
        if d[1]=='missiles': return 'weapon','missile'
        return 'weapon','ranged'
    if d[0]=='armor': return 'armor', 'class' if re.search(r'extends\s+ClassArmor',src) else 'armor'
    if d[0]=='potions': return 'potion', {'exotic':'exotic','brews':'brew','elixirs':'elixir'}.get(d[1],'') if len(d)>2 else ''
    if d[0]=='scrolls': return 'scroll', 'exotic' if len(d)>2 else ''
    if d[0]=='bags': return 'bag', 'grimoire' if len(d)>2 else ''
    if len(d)==1: return 'misc',''
    return {'artifacts':'artifact','rings':'ring','wands':'wand','stones':'stone','spells':'spell','bombs':'bomb','food':'food','keys':'key','quest':'quest','trinkets':'trinket','journal':'journal','remains':'remains'}.get(d[0],'misc'),''
out={}
root=f'{M}/{J}/items'
for r,_,fs in os.walk(root):
    for f in sorted(fs):
        if not f.endswith('.java'): continue
        p=os.path.relpath(os.path.join(r,f),root)[:-5]
        if '/curses/' in '/'+p or '/glyphs/' in '/'+p or '/enchantments/' in '/'+p: continue
        if p in EXCL: continue
        src=open(os.path.join(r,f),encoding='utf-8').read()
        if re.search(r'public\s+abstract\s+class',src): continue
        c,sub=cat(p,src)
        key='items.'+p.replace('/','.').lower()
        name=ko.get(key+'.name') or en.get(key+'.name') or p.split('/')[-1]
        desc=ko.get(key+'.desc') or en.get(key+'.desc') or ''
        m=re.search(r'image\s*=\s*ItemSpriteSheet\.(\w+)',src)
        img=m.group(1) if m else HOLD.get(c,'SOMETHING')
        t=re.search(r'\btier\s*=\s*(\d+)',src) or re.search(r'super\(\s*(\d+)\s*\)',src)
        e={'p':p.replace('/','.'),'sub':sub,'n':name,'d':desc[:400],'img':img}
        if t and c in('weapon','armor','codex'): e['t']=int(t.group(1))
        if p not in vanfiles: e['mod2']=True
        out.setdefault(c,[]).append(e)
for c in out: out[c].sort(key=lambda e:(e['sub'],e.get('t',0),e['n']))
js=("// 자동 생성 (tools/extract_spd_items.py): 게임 items 폴더의 모든 아이템 — shattered-pixel-dungeon-mod-2 기준 (mod2: 원작에 없는 것)\n"
    "// p: spd: 뒤에 쓰는 경로, sub: 세부 종류, n/d: 한국어 이름·설명, img: ItemSpriteSheet 상수, t: 티어\n"
    "PDM.SPD_ITEM_GROUPS = "+json.dumps(out,ensure_ascii=False,separators=(',',':'))+";\n"
    "// ItemSpriteSheet 상수 → 번호 (원작 16px 시트 / mod-2 32px 시트)\n"
    "PDM.SPD_ITEM_SPRITES = "+json.dumps({'vanilla':van,'mod2':mod2},separators=(',',':'))+";\n")
open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','editor','renderer','js','spd-items.js'),'w',encoding='utf-8').write(js)
print({k:len(v) for k,v in out.items()}, sum(len(v) for v in out.values()), len(js))
