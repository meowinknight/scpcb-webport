"use strict";
(() => {

/* ============================================================
   Helpers — Blitz3D-style trig works in degrees
   ============================================================ */
const RAD = Math.PI/180;
const sinD = a => Math.sin(a*RAD), cosD = a => Math.cos(a*RAD);
const rnd = (a,b) => a + Math.random()*(b-a);          // Rnd(a,b)
const rand = (a,b) => b===undefined ? 1+Math.floor(Math.random()*a) : a+Math.floor(Math.random()*(b-a+1)); // Rand(n) / Rand(a,b)
const wrap = a => ((a%360)+360)%360;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const $ = id => document.getElementById(id);

/* ============================================================
   Constants from the source
   ============================================================ */
const MAX_ITEMS = 10;                 // Items.bb: Const MaxItemAmount% = 10
const TICKS = 70;                     // FPSfactor = ElapsedTime*70
const EYE = 0.6;                      // MouseLook: camera is 0.6 above the collider centre
const COLLIDER_Y = 0.30;              // EntityRadius Collider, 0.15, 0.30
const RADIUS = 0.15;
const MOUSE_INC = 0.3, MOUSE_SENS = 0.0, MOUSE_SMOOTH = 1.0;   // mouselook_x_inc, default options


/* ============================================================
   Renderer glue — WebGL2 via js/engine.js
   ============================================================ */
const view = $('view');
const TANV = Math.tan(73.74*RAD/2);          // Blitz CameraZoom 1 on a 4:3 view => 73.7 deg vertical
let ASPECT = 16/9, ROOM = null, LightVolume = 1, TempLightVolume = 1;
const SPAWN = { x:14.0, y:2.75, z:4.0 };      // Main.bb:8452  r\obj + (3584, 704, 1024)*RoomScale

/* ============================================================
   Item templates (names / tempnames / behaviour from Items.bb + Main.bb)
   ============================================================ */
const TPL = {
  key1:{name:'Level 1 Key Card',tn:'key1',icon:'key1',w:.20,snd:'hard'},
  key3:{name:'Level 3 Key Card',tn:'key3',icon:'key3',w:.20,snd:'hard'},
  vest:{name:'Ballistic Vest',tn:'vest',icon:'vest',w:.46,snd:'soft'},
  finevest:{name:'Heavy Ballistic Vest',tn:'finevest',icon:'vest',w:.52,snd:'soft'},
  veryfinevest:{name:'Bulky Ballistic Vest',tn:'veryfinevest',icon:'vest',w:.56,snd:'soft'},
  hazmatsuit:{name:'Hazmat Suit',tn:'hazmatsuit',icon:'hazmat',w:.55,snd:'soft'},
  firstaid:{name:'First Aid Kit',tn:'firstaid',icon:'firstaid',w:.42,snd:'hard'},
  finefirstaid:{name:'Small First Aid Kit',tn:'finefirstaid',icon:'firstaid',w:.28,snd:'hard'},
  firstaid2:{name:'Blue First Aid Kit',tn:'firstaid2',icon:'firstaid2',w:.30,snd:'hard'},
  veryfinefirstaid:{name:'Strange Bottle',tn:'veryfinefirstaid',icon:'bottle',w:.22,snd:'hard'},
  gasmask:{name:'Gas Mask',tn:'gasmask',icon:'gasmask',w:.38,snd:'soft'},
  eyedrops:{name:'ReVision Eyedrops',tn:'eyedrops',icon:'eyedrops',w:.18,snd:'hard'},
  eyedropsred:{name:'RedVision Eyedrops',tn:'eyedrops',icon:'eyedropsred',w:.18,snd:'hard'},
  fineeyedrops:{name:'Eyedrops',tn:'fineeyedrops',icon:'eyedrops',w:.18,snd:'hard'},
  scp500:{name:'SCP-500-01',tn:'scp500',icon:'pill',w:.14,snd:'soft'},
  doc173:{name:'Document SCP-173',tn:'paper',icon:'paper',doc:'doc173',w:.32,snd:'paper'},
  bat:{name:'9V Battery',tn:'bat',icon:'bat9',w:.16,snd:'hard'},
  killbat:{name:'Strange Battery',tn:'killbat',icon:'batstrange',w:.18,snd:'hard'},
};
const MODEL = {   // CreateItemTemplate(name, tempname, objpath, invimg, imgpath, scale, texture)
  key1:['GFX/items/keycard.x',0.0004,'GFX/items/keycard1.jpg'], key3:['GFX/items/keycard.x',0.0004,'GFX/items/keycard3.jpg'],
  vest:['GFX/items/vest.x',0.02,'GFX/items/Vest.png'], finevest:['GFX/items/vest.x',0.022,'GFX/items/Vest.png'], veryfinevest:['GFX/items/vest.x',0.025,'GFX/items/Vest.png'],
  hazmatsuit:['GFX/items/hazmat.b3d',0.013,null],
  firstaid:['GFX/items/firstaid.x',0.05,null], finefirstaid:['GFX/items/firstaid.x',0.03,null], firstaid2:['GFX/items/firstaid.x',0.03,'GFX/items/firstaidkit2.jpg'],
  veryfinefirstaid:['GFX/items/eyedrops.b3d',0.002,'GFX/items/bottle.jpg'],
  gasmask:['GFX/items/gasmask.b3d',0.02,null],
  eyedrops:['GFX/items/eyedrops.b3d',0.0012,'GFX/items/eyedrops.jpg'], eyedropsred:['GFX/items/eyedrops.b3d',0.0012,'GFX/items/eyedropsred.jpg'], fineeyedrops:['GFX/items/eyedrops.b3d',0.0012,'GFX/items/eyedrops.jpg'],
  scp500:['GFX/items/pill.b3d',0.0001,null],
  doc173:['GFX/items/paper.x',0.003,null],
  bat:['GFX/items/Battery/Battery.x',0.008,null], killbat:['GFX/items/Battery/Battery.x',0.01,'GFX/items/Battery/Strange Battery.jpg'],
};
const ASSETS = {
  hud_blinkicon:'GFX/BlinkIcon.png', hud_sprinticon:'GFX/sprinticon.png', hud_sneakicon:'GFX/sneakicon.png', hud_hand:'GFX/handsymbol.png',
  key1:'GFX/items/INVkey1.jpg', key3:'GFX/items/INVkey3.jpg', vest:'GFX/items/INVvest.jpg', hazmat:'GFX/items/INVhazmat.jpg',
  firstaid:'GFX/items/INVfirstaid.jpg', firstaid2:'GFX/items/INVfirstaid2.jpg', bottle:'GFX/items/INVbottle.jpg', gasmask:'GFX/items/INVgasmask.jpg',
  eyedrops:'GFX/items/INVeyedrops.jpg', eyedropsred:'GFX/items/INVeyedropsred.jpg', pill:'GFX/items/INVpill.jpg', paper:'GFX/items/INVpaper.jpg',
  bat9:'GFX/items/Battery/INVbattery9v.jpg', batstrange:'GFX/items/Battery/INVbattery22900.jpg', doc173:'GFX/items/doc173.jpg',
};

/* ============================================================
   Game state (names follow the original globals)
   ============================================================ */
const S = {};
let items = [];                 // world items
const Inventory = new Array(MAX_ITEMS).fill(null);
let F = 1;                      // FPSfactor
let started = false, locked = false, fallbackLook = false;
let nowMs = 0;
const keys = {}, hit = {};      // KeyDown / KeyHit
const stick = { up:false, dn:false, l:false, r:false };   // virtual joystick -> same inputs as WASD
let touchMode = false;
let mouseHit1 = false, mouseHit2 = false, lastHit1 = 0, doubleClick = false;
let rawDX = 0, rawDY = 0;
let lastItemId = 0;
let ClosestItem = null;
let flashT = 0, hitT = 0;

function resetState(){
  Object.assign(S, {
    x:SPAWN.x, y:SPAWN.y, z:SPAWN.z, yaw:0, pitch:0, mx1:0, my1:0, DropSpeed:0,
    Stamina:100, StaminaEffect:1, StaminaEffectTimer:0,
    Injuries:0, Bloodloss:0, Infect:0, DeathTimer:0,
    Crouch:0, CrouchState:0, CurrSpeed:0, Shake:0,
    BLINKFREQ:560, BlinkTimer:560, BlinkEffect:1, BlinkEffectTimer:0, EyeStuck:0, EyeIrritation:0,
    BlurTimer:0, BlurVolume:0, CameraShake:0, CurrCameraZoom:0,
    KillTimer:0, KillAnim:0, HeadDropSpeed:0, headY:0,
    HeartBeatRate:0, HeartBeatVolume:0, HeartBeatTimer:0,
    WearingGasMask:0, WearingHazmat:0, WearingVest:0,
    Msg:'', MsgTimer:0, DeathMSG:'', InvOpen:false, SelectedItem:null,
    GodMode:false, Debug:false, deadShown:false, zoneTimer:0, camY:SPAWN.y+EYE, up:0, roll:0,
    SuperMan:false, SuperManTimer:0, invertMouse:false
  });
  Inventory.fill(null);
  items = [];
  // place the demo items on the floor in front of the spawn point
  const put = (t,x,z)=>{ const tp=TPL[t]; const g = Eng.groundAt(x, SPAWN.y-0.5, z, 12); items.push({ id:++lastItemId, t:tp, name:tp.name, x, z, y:(g?g.y:SPAWN.y-0.3)+0.01, vy:0, yaw:rand(0,359), picked:false, state:0, dist:99 }); };
  for(const [t,x,z] of ITEM_SPOTS) put(t,x,z);
  resetGuard(); if(DOOR_MODELS['Door01.x']) resetDoors(); hideMsg();
}

/* ============================================================
   Message / HUD helpers
   ============================================================ */
function setMsg(t, ticks){ S.Msg = t; S.MsgTimer = ticks; }
function hideMsg(){ S.Msg=''; S.MsgTimer=0; }

/* ============================================================
   Audio — the game's own .ogg files (SFX/…), synth only as a fallback
   ============================================================ */
let AC = null, master = null, noiseB = null;
function audio(){
  if(AC) return AC;
  AC = Eng.audio.init(); if(!AC) return null; master = Eng.audio.master;
  noiseB = AC.createBuffer(1, AC.sampleRate*1.5, AC.sampleRate);
  const d = noiseB.getChannelData(0); for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
  return AC;
}
function noiseBurst(dur, vol, freq, type='lowpass', q=0.8, attack=.003){
  if(!audio()) return;
  const src = AC.createBufferSource(); src.buffer = noiseB; src.playbackRate.value = rnd(.85,1.15);
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = AC.createGain(); const t = AC.currentTime;
  g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(vol,t+attack); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t, rnd(0,.6), dur+.05);
}
function tone(f0, f1, dur, vol, type='sine'){
  if(!audio()) return;
  const o = AC.createOscillator(); o.type = type; const g = AC.createGain(); const t = AC.currentTime;
  o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(Math.max(f1,1),t+dur);
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+.02);
}

const synth = {
  step(vol, run){ noiseBurst(run?.09:.12, vol*(run?.34:.22), run?520:360, 'lowpass', .7); tone(run?90:70, 40, .08, vol*.1); },
  pick(kind){ if(kind==='paper') noiseBurst(.12,.16,3000,'highpass'); else if(kind==='soft') noiseBurst(.1,.22,900,'lowpass'); else { noiseBurst(.05,.2,2400,'bandpass',2); tone(900,500,.05,.05,'square'); } },
  beat(vol){ tone(60,38,.13,vol*.9); setTimeout(()=>tone(52,34,.16,vol*.7),190); },
  breath(vol){ noiseBurst(.7,vol*.28,700,'bandpass',.6,.25); },
  shot(){ noiseBurst(.18,.5,3000,'highpass'); tone(140,40,.2,.45,'sawtooth'); },
  bullethit(){ noiseBurst(.12,.4,500,'lowpass'); tone(90,30,.2,.4); },
  drip(){ tone(1400,500,.06,.05); },
  zap(){ noiseBurst(.3,.3,1500,'bandpass',3); tone(300,60,.3,.25,'square'); },
};
const smp = (p, vol=1, rate=1) => Eng.audio.play(p, { vol, rate });
const sfx = {
  step(vol, run, metal){ const f = (metal ? (run?'RunMetal':'StepMetal') : (run?'Run':'Step')) + rand(1,8); if(!smp('SFX/Step/'+f+'.ogg', vol*(run?.9:.7))) synth.step(vol, run); },
  pick(kind){ const n = kind==='soft' ? 2 : 0; if(!smp('SFX/Interact/PickItem'+n+'.ogg', .8)) synth.pick(kind); },
  beat(vol){ if(!smp('SFX/Character/D9341/Heartbeat.ogg', Math.min(vol,1))) synth.beat(vol); },
  breath(vol){ const g = S.WearingGasMask || S.WearingHazmat; if(!smp('SFX/Character/D9341/breath'+rand(0,4)+(g?'gas':'')+'.ogg', Math.min(vol*1.2,1))) synth.breath(vol); },
  shot(){ if(!smp('SFX/General/Gunshot.ogg', .7)) synth.shot(); },
  bullethit(){ if(!smp('SFX/General/BulletHit.ogg', .8)) synth.bullethit(); },
  damage(){ if(!smp('SFX/Character/D9341/Damage1.ogg', .9)) synth.bullethit(); },
  drip(){ if(!smp('SFX/Character/D9341/BloodDrip'+rand(0,3)+'.ogg', .5)) synth.drip(); },
  zap(){ synth.zap(); },
  use(){ if(!smp('SFX/Interact/PickItem0.ogg', .5, .9)) noiseBurst(.08,.15,1800,'bandpass',1.5); },
  done(){ },
};

/* ============================================================
   Port of: CurveValue (Main.bb 10598)
   ============================================================ */
function curve(n, old, s){
  if(F === 0) return old;
  return n < old ? Math.max(old + (n-old)*(1/s*F), n) : Math.min(old + (n-old)*(1/s*F), n);
}

/* ============================================================
   Port of: Kill / Shoot / damage
   ============================================================ */
function kill(){
  if(S.GodMode) return;
  if(S.KillTimer >= 0){
    S.KillAnim = rand(0,1);
    S.KillTimer = Math.min(-1, S.KillTimer);
    S.HeadDropSpeed = 0; S.headY = S.camY; S.headP = 0; S.hx = S.x; S.hz = S.z; S.headYaw = S.yaw;
    sfx.damage();
    S.SelectedItem = null; S.InvOpen = false; showInv(false);
  }
}
// NPCs.bb: Function Shoot(...) — damage model with/without vest, verbatim ranges
function shoot(hitProb){
  sfx.shot(); LightVolume = TempLightVolume*1.2;   // NPCs.bb Shoot: muzzle light
  if(S.GodMode) return;
  if(Math.random() <= hitProb){
    S.jolt = [rnd(-3,3), rnd(-3,3)];   // TurnEntity Camera, Rnd(-3,3), Rnd(-3,3), 0 (lasts the one frame it is rendered)
    let m = '';
    if(S.WearingVest > 0){
      if(S.WearingVest === 1){
        switch(rand(8)){
          case 1: case 2: case 3: case 4: case 5: S.BlurTimer=500; S.Stamina=0; m='A bullet penetrated your vest, making you gasp.'; S.Injuries+=rnd(.1,.5); break;
          case 6: S.BlurTimer=500; m='A bullet hit your left leg.'; S.Injuries+=rnd(.8,1.2); break;
          case 7: S.BlurTimer=500; m='A bullet hit your right leg.'; S.Injuries+=rnd(.8,1.2); break;
          case 8: S.BlurTimer=500; S.Stamina=0; m='A bullet struck your neck, making you gasp.'; S.Injuries+=rnd(1.2,1.6); break;
        }
      } else {
        if(rand(10) === 1){ S.BlurTimer=500; S.Stamina-=1; m='A bullet hit your chest. The vest absorbed some of the damage.'; S.Injuries+=rnd(.8,1.1); }
        else { m='A bullet hit your chest. The vest absorbed most of the damage.'; S.Injuries+=rnd(.1,.5); }
      }
      if(S.Injuries >= 5 && rand(3) === 1) kill();
    } else {
      switch(rand(6)){
        case 1: S.DeathMSG='Subject killed by a single gunshot in the test room.'; kill(); break;
        case 2: S.BlurTimer=500; m='A bullet hit your left leg.'; S.Injuries+=rnd(.8,1.2); break;
        case 3: S.BlurTimer=500; m='A bullet hit your right leg.'; S.Injuries+=rnd(.8,1.2); break;
        case 4: S.BlurTimer=500; m='A bullet hit your right shoulder.'; S.Injuries+=rnd(.8,1.2); break;
        case 5: S.BlurTimer=500; m='A bullet hit your left shoulder.'; S.Injuries+=rnd(.8,1.2); break;
        case 6: S.BlurTimer=500; m='A bullet hit your right shoulder.'; S.Injuries+=rnd(2.5,4.0); break;
      }
    }
    if(S.MsgTimer < 64*4 && m){ setMsg(m, TICKS*6); }
    S.Injuries = Math.min(S.Injuries, 4.0);
    sfx.bullethit();
  }
}

/* ============================================================
   Inventory helpers — Items.bb
   ============================================================ */
const hasTn = (tn) => Inventory.some(i=>i && i.t.tn===tn);
const isVest = i => i && (i.t.tn==='vest'||i.t.tn==='finevest');
const isHaz  = i => i && i.t.tn==='hazmatsuit';

function removeItem(it){
  for(let n=0;n<MAX_ITEMS;n++) if(Inventory[n]===it){ Inventory[n]=null; break; }
  if(S.SelectedItem === it){
    switch(it.t.tn){
      case 'gasmask': S.WearingGasMask=0; break;
      case 'vest': case 'finevest': S.WearingVest=0; break;
      case 'hazmatsuit': S.WearingHazmat=0; break;
    }
    S.SelectedItem = null;
  }
  items = items.filter(x=>x!==it);
}

// Items.bb: PickItem
function pickItem(it){
  let full = true;
  for(let n=0;n<MAX_ITEMS;n++) if(!Inventory[n]){ full=false; break; }
  if(S.WearingHazmat > 0){ setMsg('You cannot pick up any items while wearing a hazmat suit.', TICKS*5); return; }
  if(full){ setMsg('You cannot carry any more items.', TICKS*5); return; }
  let slot = Inventory.indexOf(null);
  switch(it.t.tn){
    case 'killbat':
      flashT = 1; sfx.zap();
      S.DeathMSG = 'Subject D-9341 found dead inside SCP-914\'s output booth next to what appears to be an ordinary nine-volt battery. The subject is covered in severe electrical burns, and assumed to be killed via an electrical shock caused by the battery. The battery has been stored for further study.';
      kill(); break;
    case 'veryfinevest':
      setMsg('The vest is too heavy to pick up.', TICKS*6); return;
    case 'firstaid': case 'finefirstaid': case 'firstaid2': it.state = 0; break;
    case 'hazmatsuit': {
      let can = true;
      for(const o of Inventory){ if(!o) continue;
        if(o.t.tn==='hazmatsuit'){ can=false; break; }
        if(o.t.tn==='vest'||o.t.tn==='finevest'){ can = 2; break; } }
      if(can===false){ setMsg('You are not able to wear two hazmat suits at the same time.', TICKS*5); return; }
      if(can===2){ setMsg('You are not able to wear a vest and a hazmat suit at the same time.', TICKS*5); return; }
      S.SelectedItem = it; break; }
    case 'vest': case 'finevest': {
      let can = true;
      for(const o of Inventory){ if(!o) continue;
        if(o.t.tn==='vest'||o.t.tn==='finevest'){ can=false; break; }
        if(o.t.tn==='hazmatsuit'){ can = 2; break; } }
      if(can===false){ setMsg('You are not able to wear two vests at the same time.', TICKS*5); return; }
      if(can===2){ setMsg('You are not able to wear a vest and a hazmat suit at the same time.', TICKS*5); return; }
      S.SelectedItem = it; break; }
  }
  if(S.KillTimer < 0) return;
  sfx.pick(it.t.snd);
  it.picked = true;
  Inventory[slot] = it;
}

// Items.bb: DropItem
function dropItem(it, sound=true){
  if(S.WearingHazmat > 0){ setMsg('You cannot drop any items while wearing a hazmat suit.', TICKS*5); return; }
  if(sound) sfx.pick(it.t.snd);
  const yaw = S.yaw + rnd(-20,20);
  it.x = S.x + (-sinD(S.yaw))*0.1; it.z = S.z + cosD(S.yaw)*0.1;
  it.y = S.camY - 0.1; it.vy = 0; it.picked = false; it.yaw = rand(0,359);
  for(let z=0;z<MAX_ITEMS;z++) if(Inventory[z]===it) Inventory[z]=null;
  switch(it.t.tn){
    case 'gasmask': S.WearingGasMask=0; break;
    case 'hazmatsuit': S.WearingHazmat=0; break;
    case 'vest': case 'finevest': S.WearingVest=0; break;
  }
}


/* ============================================================
   Port of: MovePlayer (Main.bb 4041) — stamina, sprint, crouch, injuries, bloodloss, gravity + collision
   ============================================================ */
function movePlayer(){
  let Sprint = 1.0, Speed = 0.018, temp;
  const sprintKey = keys.ShiftLeft || keys.ShiftRight;
  const dead = S.KillTimer < 0;
  if(S.SuperMan){
    Speed *= 3;
    S.SuperManTimer = (S.SuperManTimer||0) + F;
    S.CameraShake = sinD(S.SuperManTimer/5.0) * (S.SuperManTimer/1500.0);
    if(S.SuperManTimer > 70*50){
      S.DeathMSG = 'A Class D jumpsuit found in [DATA REDACTED]. Upon further examination, the jumpsuit was found to be filled with 12.5 kilograms of blue ash-like substance. Chemical analysis of the substance remains non-conclusive. Most likely related to SCP-914.';
      kill();
    } else S.BlurTimer = 500;
  }

  if(S.DeathTimer > 0){ S.DeathTimer -= F; if(S.DeathTimer < 1) S.DeathTimer = -1; }
  else if(S.DeathTimer < 0) kill();

  // stamina regen (faster when standing still)
  if(S.CurrSpeed > 0) S.Stamina = Math.min(S.Stamina + 0.15*F/1.25, 100);
  else S.Stamina = Math.min(S.Stamina + 0.15*F*1.25, 100);

  if(S.StaminaEffectTimer > 0) S.StaminaEffectTimer -= F/70;
  else if(S.StaminaEffect !== 1.0) S.StaminaEffect = 1.0;

  // out-of-breath sounds while holding sprint
  if(sprintKey && !dead){
    if(S.Stamina < 50){ S._breathT = (S._breathT||0) - F; if(S._breathT <= 0){ sfx.breath(Math.min((70-S.Stamina)/70,1)); S._breathT = S.Stamina<5 ? 55 : 90; } }
  }

  if(hasTn('finevest')) S.Stamina = Math.min(S.Stamina, 60);

  if(Math.abs(S.CrouchState - S.Crouch) < 0.001) S.CrouchState = S.Crouch;
  else S.CrouchState = curve(S.Crouch, S.CrouchState, 10.0);

  const mvUp = keys.KeyW||stick.up, mvDn = keys.KeyS||stick.dn, mvL = keys.KeyA||stick.l, mvR = keys.KeyD||stick.r;
  if(!dead && (mvUp || mvDn || mvL || mvR)){
    if(S.Crouch === 0 && sprintKey && S.Stamina > 0.0){
      Sprint = 2.5;
      S.Stamina -= F * 0.4 * S.StaminaEffect;
      if(S.Stamina <= 0) S.Stamina = -20.0;
    }
    if(S.SelectedItem){
      const tn = S.SelectedItem.t.tn;
      if(tn==='firstaid'||tn==='finefirstaid'||tn==='firstaid2') Sprint = 0;
    }
    temp = (S.Shake % 360);
    S.Shake = (S.Shake + F * Math.min(Sprint, 1.5) * 7) % 720;
    if(temp < 180 && (S.Shake % 360) >= 180 && S.KillTimer >= 0){
      const run = Sprint !== 1.0;
      { const g = Eng.groundAt(S.x, S.y, S.z, 1); sfx.step(1.0 - S.Crouch*0.6, run, g && Eng.stepClass(g.surf) === 1); }
    }
  }

  if(hit.KeyC || hit.ControlLeft){ if(!dead) S.Crouch = S.Crouch ? 0 : 1; }

  let temp2 = (Speed * Sprint) / (1.0 + S.CrouchState);
  temp2 = temp2 / Math.max((S.Injuries + 3.0)/3.0, 1.0);
  if(S.Injuries > 0.5) temp2 = temp2 * Math.min((sinD(S.Shake/2) + 1.2), 1.0);

  let moving = false, angle = 0;
  if(!dead){
    if(mvDn){ moving = true; angle = 180; if(mvL) angle = 135; if(mvR) angle = -135; }
    else if(mvUp){ moving = true; angle = 0; if(mvL) angle = 45; if(mvR) angle = -45; }
    else { if(mvL){ angle = 90; moving = true; } if(mvR){ angle = -90; moving = true; } }
  }
  angle = wrap(S.yaw + angle + 90.0);

  if(moving) S.CurrSpeed = curve(temp2, S.CurrSpeed, 20.0);
  else S.CurrSpeed = Math.max(curve(0.0, S.CurrSpeed - 0.1, 1.0), 0.0);

  if(!dead){
    const P = [S.x, S.y, S.z];
    let fl = Eng.moveCollider(P, cosD(angle) * S.CurrSpeed * F, 0, sinD(angle) * S.CurrSpeed * F).floor;
    const g = Eng.groundAt(P[0], P[1], P[2], 1.0);
    if(fl || (g && P[1] - g.y < 0.33 && S.DropSpeed <= 0)){
      if(S.DropSpeed < -0.07){ const gg = g || {surf:-1}; sfx.step(1.0, false, Eng.stepClass(gg.surf) === 1); }
      S.DropSpeed = 0;
    } else S.DropSpeed = Math.min(Math.max(S.DropSpeed - 0.006 * F, -2.0), 0.0);
    if(S.DropSpeed !== 0) fl = Eng.moveCollider(P, 0, S.DropSpeed * F, 0).floor;
    S.x = P[0]; S.y = P[1]; S.z = P[2];
  }

  // --- injuries -> bloodloss (Main.bb 4296-4339)
  if(S.Injuries > 1.0){
    const prev = S.Bloodloss;
    S.BlurTimer = Math.max(Math.max(sinD(nowMs/100.0)*S.Bloodloss*30.0, S.Bloodloss*2*(2.0-S.CrouchState)), S.BlurTimer);
    S.Bloodloss = Math.min(S.Bloodloss + (Math.min(S.Injuries,3.5)/300.0)*F, 100);
    if(prev <= 60 && S.Bloodloss > 60){ setMsg('You are feeling faint from the amount of blood you have lost.', TICKS*4); }
  }
  if(S.Bloodloss > 0){
    if(rnd(0,200) < Math.min(S.Injuries,4.0)) sfx.drip();
    S.CurrCameraZoom = Math.max(S.CurrCameraZoom, (sinD(nowMs/20.0)+1.0)*S.Bloodloss*0.2);
    if(S.Bloodloss > 60) S.Crouch = 1;
    if(S.Bloodloss >= 100){ if(!S.DeathMSG) S.DeathMSG = 'Subject bled out in the test room.'; kill(); S.HeartBeatVolume = 0; }
    else if(S.Bloodloss > 80.0){
      S.HeartBeatRate = Math.max(150-(S.Bloodloss-80)*5, S.HeartBeatRate);
      S.HeartBeatVolume = Math.max(S.HeartBeatVolume, 0.75+(S.Bloodloss-80.0)*0.0125);
    } else if(S.Bloodloss > 35.0){
      S.HeartBeatRate = Math.max(70+S.Bloodloss, S.HeartBeatRate);
      S.HeartBeatVolume = Math.max(S.HeartBeatVolume, (S.Bloodloss-35.0)/60.0);
    }
  }

  if(hit.Space) S.BlinkTimer = 0;
  if(keys.Space && S.BlinkTimer < -10) S.BlinkTimer = -10;

  if(S.HeartBeatVolume > 0){
    if(S.HeartBeatTimer <= 0){ sfx.beat(S.HeartBeatVolume); S.HeartBeatTimer = 70.0*(60.0/Math.max(S.HeartBeatRate,1.0)); }
    else S.HeartBeatTimer -= F;
    S.HeartBeatVolume = Math.max(S.HeartBeatVolume - F*0.05, 0);
  }
}


/* ============================================================
   Port of: MouseLook (Main.bb 4370)
   ============================================================ */
function mouseLook(){
  S.CameraShake = Math.max(S.CameraShake - (F/10), 0);
  S.CurrCameraZoom = Math.max(S.CurrCameraZoom - F, 0);
  if(S.KillTimer >= 0){
    const up = (sinD(S.Shake) / (20.0 + S.CrouchState*20.0)) * 0.6;
    const roll = Math.max(Math.min(sinD(S.Shake/2)*2.5*Math.min(S.Injuries+0.25,3.0), 8.0), -8.0);
    S.up = up; S.roll = roll;
    S.camY = S.y + up + EYE + S.CrouchState * -0.3;

    S.mx1 = curve(rawDX * (MOUSE_SENS + 0.6), S.mx1, (6.0/(MOUSE_SENS+1.0))*MOUSE_SMOOTH);
    S.my1 = curve(rawDY * (MOUSE_SENS + 0.6), S.my1, (6.0/(MOUSE_SENS+1.0))*MOUSE_SMOOTH);
    // arrow keys look (always available; essential when the browser blocks pointer-lock)
    if(keys.ArrowLeft)  S.mx1 -= 0.7*F; if(keys.ArrowRight) S.mx1 += 0.7*F;
    if(keys.ArrowUp)    S.my1 -= 0.5*F; if(keys.ArrowDown)  S.my1 += 0.5*F;
    const yawD = S.mx1 * MOUSE_INC / (1.0 + S.WearingVest);
    const pitchD = (S.invertMouse ? -S.my1 : S.my1) * MOUSE_INC / (1.0 + S.WearingVest);
    S.yaw = wrap(S.yaw - yawD);
    S.pitch = clamp(S.pitch + pitchD, -70, 70);
  } else {
    // death: Main.bb MouseLook Else-branch — the Head pivot falls, the camera follows it
    const floorY = S.y - COLLIDER_Y + 0.12;
    if(S.headY <= floorY + 0.01){ S.HeadDropSpeed = 0; }
    else {
      const sg = S.KillAnim === 0 ? 1 : -1, d = S.HeadDropSpeed * sg, cp = cosD(S.headP);
      S.hx += -sinD(S.headYaw)*cp*d; S.hz += cosD(S.headYaw)*cp*d; S.headY = Math.max(S.headY - sinD(S.headP)*d, floorY);
      S.headP = curve(S.KillAnim === 0 ? -90 : 90, S.headP, 20);
      S.pitch = curve(clamp(S.headP + (S.KillAnim === 0 ? -40 : 40), -90, 90), S.pitch, 40);
      S.HeadDropSpeed -= 0.002 * F;
    }
    S.camY = S.headY;
    S.pitch += (S.invertMouse ? -rawDY : rawDY) * 0.05 * F; S.yaw = wrap(S.yaw - rawDX * 0.15 * F);
    S.KillTimer -= F*0.8;
  }
  rawDX = 0; rawDY = 0;
}


/* ============================================================
   Port of: UpdateItems / ClosestItem
   ============================================================ */
function updateItems(){
  ClosestItem = null;
  const fx = -sinD(S.yaw), fz = cosD(S.yaw);
  let best = 99;
  for(const i of items){
    if(i.picked) continue;
    // gravity (Items.bb: DropSpeed - 0.0004*FPSfactor), collider radius 0.01
    const gr = Eng.groundAt(i.x, i.y + 0.02, i.z, 30), floorY = (gr ? gr.y : -50) + 0.01;
    if(i.y > floorY + 1e-4 || i.vy !== 0){
      i.vy -= 0.0004 * F; i.y += i.vy * F;
      if(i.y <= floorY){ i.y = floorY; i.vy = 0; }
    }
    const dx = i.x - S.x, dz = i.z - S.z, dy = i.y - S.camY;
    i.dist = Math.hypot(dx,dz,dy);
    if(i.dist < 1.2 && !S.InvOpen){
      // EntityInView(item, Camera): test against the full pitched view frustum
      const cp = cosD(S.pitch), sp = sinD(S.pitch);
      const depth = dx*fx*cp - dy*sp + dz*fz*cp;
      const side  = dx*cosD(S.yaw) + dz*sinD(S.yaw);
      const upv   = dx*fx*sp + dy*cp + dz*fz*sp;
      const inView = depth > 0.05 && Math.abs(side/depth) < TANV*ASPECT*1.05 && Math.abs(upv/depth) < TANV*1.05;
      if(inView && Eng.segClear(S.x,S.camY,S.z,i.x,i.y+0.03,i.z) && i.dist < best){ best = i.dist; ClosestItem = i; }
    }
    if(i.y < -35) { removeItem(i); }
  }
  if(ClosestItem && (mouseHit1 || hit.KeyE)) pickItem(ClosestItem);
}

/* ============================================================
   Port of: the item-use part of UpdateGUI (Main.bb ~5600-7100)
   ============================================================ */
function canUse(hazmatOk, gasOk, eyeOk){
  if(!hazmatOk && S.WearingHazmat){ setMsg("You can't use that item while wearing a hazmat suit.", TICKS*5); return false; }
  if(!gasOk && S.WearingGasMask){ setMsg("You can't use that item while wearing a gas mask.", TICKS*5); return false; }
  return true;
}
const heldUI = { shown:false };
function updateHeld(){
  const it = S.SelectedItem;
  let showProg = null;
  if(it && !S.InvOpen){
    const tn = it.t.tn;
    switch(tn){
      case 'firstaid': case 'finefirstaid': case 'firstaid2':
        if(S.Bloodloss === 0 && S.Injuries === 0){
          setMsg('You do not need to use a first aid kit right now.', TICKS*5); S.SelectedItem = null; break; }
        if(canUse(false,true,true)){
          S.CurrSpeed = curve(0, S.CurrSpeed, 5.0);
          S.Crouch = 1;
          it.state = Math.min(it.state + (F/5.0), 100);
          showProg = it.state;
          if(it.state === 100){
            if(tn === 'finefirstaid'){
              S.Bloodloss = 0; S.Injuries = Math.max(0, S.Injuries - 2.0);
              if(S.Injuries === 0) setMsg('You bandaged the wounds and took a painkiller. You feel fine.', TICKS*5);
              else if(S.Injuries > 1.0) setMsg('You bandaged the wounds and took a painkiller, but you were not able to stop the bleeding.', TICKS*5);
              else setMsg('You bandaged the wounds and took a painkiller, but you still feel sore.', TICKS*5);
              removeItem(it);
            } else {
              S.Bloodloss = Math.max(0, S.Bloodloss - rand(10,20));
              if(S.Injuries >= 2.5){ setMsg('The wounds were way too severe to staunch the bleeding completely.', TICKS*5); S.Injuries = Math.max(2.5, S.Injuries - rnd(.3,.7)); }
              else if(S.Injuries > 1.0){
                S.Injuries = Math.max(0.5, S.Injuries - rnd(.5,1.0));
                setMsg(S.Injuries > 1.0 ? 'You bandaged the wounds but were unable to staunch the bleeding completely.' : 'You managed to stop the bleeding.', TICKS*5);
              } else {
                if(S.Injuries > 0.5){ S.Injuries = 0.5; setMsg('You took a painkiller, easing the pain slightly.', TICKS*5); }
                else { S.Injuries = 0.5; setMsg('You took a painkiller, but it still hurts to walk.', TICKS*5); }
              }
              if(tn === 'firstaid2'){
                switch(rand(6)){
                  case 1: S.SuperMan = true; setMsg('You have becomed overwhelmedwithadrenalineholyshitWOOOOOO~!', TICKS*5); break;
                  case 2: setMsg('You suddenly find it very difficult to turn your head.', TICKS*5); S.invertMouse = !S.invertMouse; break;
                  case 3: S.BlurTimer = 5000; setMsg('You feel nauseated.', TICKS*5); break;
                  case 4: S.BlinkEffect = 0.6; S.BlinkEffectTimer = rand(20,30); break;
                  case 5: S.Bloodloss = 0; S.Injuries = 0; setMsg('You bandaged the wounds. The bleeding stopped completely and you feel fine.', TICKS*5); break;
                  case 6: setMsg('You bandaged the wounds and blood started pouring heavily through the bandages.', TICKS*5); S.Injuries = 3.5; break;
                }
              }
              removeItem(it);
            }
            sfx.done();
          }
        }
        break;
      case 'veryfinefirstaid':
        if(canUse(false,false,true)){
          switch(rand(5)){
            case 1: S.Injuries = 3.5; setMsg('You started bleeding heavily.', TICKS*7); break;
            case 2: S.Injuries = 0; S.Bloodloss = 0; setMsg('Your wounds are healing up rapidly.', TICKS*7); break;
            case 3: S.Injuries = Math.max(0, S.Injuries - rnd(.5,3.5)); S.Bloodloss = Math.max(0, S.Bloodloss - rnd(10,100)); setMsg('You feel much better.', TICKS*7); break;
            case 4: S.BlurTimer = 10000; S.Bloodloss = 0; setMsg('You feel nauseated.', TICKS*7); break;
            case 5: S.BlinkTimer = -10; S.Injuries = 2.5; setMsg('You started bleeding heavily.', TICKS*7); break; // original: pocket-dimension teleport, which this port has no room for
          }
          sfx.use(); removeItem(it);
        }
        break;
      case 'vest': case 'finevest':
        S.CurrSpeed = curve(0, S.CurrSpeed, 5.0);
        it.state = Math.min(it.state + (F/(2.0+(0.5*(tn==='finevest'?1:0)))), 100);
        showProg = it.state;
        if(it.state === 100){
          if(S.WearingVest > 0){ setMsg('You removed the vest.', TICKS*5); S.WearingVest = 0; dropItem(it); }
          else { S.WearingVest = tn==='vest' ? 1 : 2; setMsg(tn==='vest' ? 'You put on the vest and feel slightly encumbered.' : 'You put on the vest and feel heavily encumbered.', TICKS*5); sfx.pick('soft'); }
          it.state = 0; S.SelectedItem = null;
        }
        break;
      case 'hazmatsuit':
        if(S.WearingVest === 0){
          S.CurrSpeed = curve(0, S.CurrSpeed, 5.0);
          it.state = Math.min(it.state + (F/4.0), 100);
          showProg = it.state;
          if(it.state === 100){
            if(S.WearingHazmat > 0){ setMsg('You removed the hazmat suit.', TICKS*5); S.WearingHazmat = 0; dropItem(it); }
            else { S.WearingHazmat = 1; sfx.pick('soft'); setMsg('You put on the hazmat suit.', TICKS*5); S.WearingGasMask = 0; }
            it.state = 0; S.SelectedItem = null;
          }
        }
        break;
      case 'gasmask':
        if(S.WearingHazmat === 0){
          setMsg(S.WearingGasMask ? 'You removed the gas mask.' : 'You put on the gas mask.', TICKS*5);
          S.WearingGasMask = S.WearingGasMask ? 0 : 1;
          sfx.pick('soft');
        } else setMsg('You need to take off the hazmat suit in order to put on the gas mask.', TICKS*5);
        S.SelectedItem = null;
        break;
      case 'eyedrops':
        if(canUse(false,false,false)){ S.BlinkEffect = 0.6; S.BlinkEffectTimer = rand(20,30); S.BlurTimer = 200; sfx.use(); removeItem(it); }
        break;
      case 'fineeyedrops':
        if(canUse(false,false,false)){ S.BlinkEffect = 0.4; S.BlinkEffectTimer = rand(30,40); S.Bloodloss = Math.max(S.Bloodloss-1.0, 0); S.BlurTimer = 200; sfx.use(); removeItem(it); }
        break;
      case 'scp500':
        if(canUse(false,false,true)){
          setMsg(S.Infect > 0 ? 'You swallowed the pill. Your nausea is fading.' : 'You swallowed the pill.', TICKS*7);
          S.DeathTimer = 0; S.Infect = 0; S.Stamina = 100;
          if(S.StaminaEffect > 1.0){ S.StaminaEffect = 1.0; S.StaminaEffectTimer = 0; }
          sfx.use(); removeItem(it);
        }
        break;
      default: break;  // keycards, paper, battery: simply held up
    }
  }
  // un-held progress items reset (Main.bb ~7100)
  for(const o of items){ if(o!==S.SelectedItem){ const t=o.t.tn; if(t==='firstaid'||t==='finefirstaid'||t==='firstaid2'||t==='vest'||t==='finevest'||t==='hazmatsuit') o.state = 0; } }

  // put away (MouseHit2)
  if((mouseHit2 || hit.KeyQ) && S.SelectedItem && !S.InvOpen){
    const o = S.SelectedItem, tn = o.t.tn;
    if(tn==='firstaid'||tn==='finefirstaid'||tn==='firstaid2') o.state = 0;
    else if(tn==='vest'||tn==='finevest'){ o.state = 0; if(!S.WearingVest) dropItem(o,false); }
    else if(tn==='hazmatsuit'){ o.state = 0; if(!S.WearingHazmat) dropItem(o,false); }
    sfx.pick(o.t.snd);
    S.SelectedItem = null;
  }
  renderHeld(showProg);
}
function renderHeld(prog){
  const it = S.SelectedItem, el = $('held');
  if(!it || S.InvOpen || S.KillTimer<0){ el.style.display='none'; return; }
  el.style.display = 'block';
  const tpl = it.t;
  const isDoc = !!tpl.doc;
  $('helddoc').style.display = isDoc ? 'block' : 'none';
  const showIcon = !isDoc && (prog!==null || ['key1','key3'].includes(tpl.tn));
  $('heldic').style.display = showIcon ? 'block' : 'none';
  if(isDoc && $('helddoc').dataset.k !== tpl.doc){ $('helddoc').src = ASSETS[tpl.doc]; $('helddoc').dataset.k = tpl.doc; }
  if(showIcon && $('heldic').dataset.k !== tpl.icon){ $('heldic').src = ASSETS[tpl.icon]; $('heldic').dataset.k = tpl.icon; }
  const p = $('prog');
  if(prog !== null){ p.style.display='block'; p.firstElementChild.style.width = prog+'%'; } else p.style.display='none';
  if(!isDoc && !showIcon && prog===null) el.style.display='none';
}

/* ============================================================
   Port of: blink + eye effects (Main.bb ~3030)
   ============================================================ */
let darkA = 0, lagBlur = 0, lagDark = 0;
function updateBlink(){
  darkA = 0;
  if(S.BlinkEffectTimer > 0) S.BlinkEffectTimer -= F/70; else if(S.BlinkEffect !== 1.0) S.BlinkEffect = 1.0;
  if(S.EyeStuck > 0){ S.BlinkTimer = S.BLINKFREQ; S.EyeStuck = Math.max(S.EyeStuck-F,0); }
  if(S.BlinkTimer < 0){
    if(S.BlinkTimer > -5) darkA = Math.max(darkA, sinD(Math.abs(S.BlinkTimer*18.0)));
    else if(S.BlinkTimer > -15) darkA = 1.0;
    else darkA = Math.max(darkA, Math.abs(sinD(S.BlinkTimer*18.0)));
    if(S.BlinkTimer <= -20){ S.BLINKFREQ = rnd(455,665); S.BlinkTimer = S.BLINKFREQ; }
    S.BlinkTimer -= F;
  } else {
    S.BlinkTimer -= F * 0.6 * S.BlinkEffect;
    if(S.EyeIrritation > 0) S.BlinkTimer -= Math.min(S.EyeIrritation/100.0 + 1.0, 4.0) * F;
  }
}


/* ============================================================
   World update — one FPSfactor-scaled step
   ============================================================ */
function updateLightVolume(){
  // MapSystem.bb UpdateRooms: sum(intensity^2 * (HideDistance-dist)/HideDistance) / 4.5, min 1
  let t = 0; const HD = 15;
  for(const l of ROOM.lights){ const d = Math.hypot(l.x-S.x, l.y-S.y, l.z-S.z); if(d < HD) t += l.intensity*l.intensity*((HD-d)/HD); }
  TempLightVolume = Math.max(t/4.5, 1.0);
  LightVolume = curve(TempLightVolume, LightVolume, 50.0);
}
function updateWorld(){
  movePlayer();
  mouseLook();
  updateLightVolume();
  updateItems();
  updateGuard();
  updateDoors();
  updateHeld();
  updateBlink();
  // BlurVolume (Main.bb 3013)
  S.BlurVolume = Math.min(curve(0.0, S.BlurVolume, 20.0), 0.95);
  if(S.BlurTimer > 0){ S.BlurVolume = Math.max(Math.min(0.95, S.BlurTimer/1000.0), S.BlurVolume); S.BlurTimer = Math.max(S.BlurTimer - F, 0.0); }
  if(S.KillTimer < 0) S.BlurTimer = Math.abs(S.KillTimer*5);
  if(S.MsgTimer > 0) S.MsgTimer -= F;
  flashT = Math.max(flashT - F/20, 0);
  updateAmbient();
}
// RoomAmbience emitters (looped, attenuated like LoopSound2: gain = 1 - dist/range)
const AMB = [];
function updateAmbient(){
  for(const a of AMB){
    if(!a.h || !a.h.playing){ a.h = Eng.audio.play(a.file, { vol:0, loop:true }); if(!a.h) continue; }
    const d = Math.hypot(a.x-S.x, a.y-S.camY, a.z-S.z);
    a.h.gain.gain.value = Math.max(0, 1 - d/a.range) * 0.8;
  }
}

/* ============================================================
   Renderer: hands the state to the WebGL engine (the world itself is the real 173 room mesh)
   ============================================================ */
function render(){
  const r = view.getBoundingClientRect(); const sc = Math.min(1, 1280/Math.max(r.width,1), 720/Math.max(r.height,1)) * Math.min(window.devicePixelRatio||1, 2);
  Eng.resize(Math.round(r.width*Math.min(sc,1.0)) || 960, Math.round(r.height*Math.min(sc,1.0)) || 540);
  ASPECT = (r.width||16)/(r.height||9);
  const zoom = Math.min(1.0 + S.CurrCameraZoom/400.0, 1.1);
  const cam = Eng.camera;
  const dead = S.KillTimer < 0, jl = S.jolt || [0,0]; S.jolt = null;
  cam.pos = dead ? [S.hx, S.camY, S.hz] : [S.x, S.camY, S.z];
  cam.yaw = S.yaw + rnd(-S.CameraShake,S.CameraShake) + jl[1]; cam.pitch = S.pitch + rnd(-S.CameraShake,S.CameraShake) + jl[0]; cam.roll = S.roll;
  cam.zoom = zoom; cam.fovy = 73.74;
  const fn = 0.5*LightVolume, ff = 6.0*LightVolume;          // options.ini: camera fog near/far
  cam.fog = [fn, ff]; cam.far = Math.min(ff*1.5, 28);
  const list = [];
  for(const it of items){
    if(it.picked || !it.mdl) continue;
    list.push({ mdl: it.mdl, M: Eng.mat.trs([it.x, it.y, it.z], it.yaw, 0, 0, [it.sc,it.sc,it.sc]), amb: 0.5, dir: 0.5 });
  }
  if(GUARD.mdl && GUARD.enabled) list.push({ mdl: GUARD.mdl, M: Eng.mat.trs([GUARD.x, GUARD.y, GUARD.z], GUARD.yaw, 0, 0, [0.116,0.116,0.116]), amb: 0.5, dir: 0.5 });
  pushDoors(list);
  Eng.drawList = list;
  let dk = darkA;
  if(S.KillTimer < 0) dk = Math.max(dk, Math.min(Math.abs(S.KillTimer/400.0), 1.0));
  Eng.post.roll = 0; Eng.post.scale = 1; Eng.post.blur = lagBlur; Eng.post.dark = lagDark; Eng.post.gamma = 0.85;
  Eng.render(ROOM);
  lagBlur = S.BlurVolume; lagDark = dk;   // original sets these alphas after RenderWorld2, so they apply next frame
}

/* ============================================================
   DOM HUD
   ============================================================ */
const blinkm = $('blinkm'), stamm = $('stamm');
function buildMeter(el, n){ el.innerHTML=''; for(let i=0;i<n;i++){ const b=document.createElement('i'); el.appendChild(b);} }
buildMeter(blinkm, 19); buildMeter(stamm, 19);
function setMeter(el, frac, red){
  const n = el.children.length, on = Math.max(0, Math.floor(n*frac));
  for(let i=0;i<n;i++) el.children[i].style.visibility = i<on ? 'visible':'hidden';
  el.classList.toggle('low', !!red);
}
function updateHUD(){
  setMeter(blinkm, clamp(S.BlinkTimer/S.BLINKFREQ,0,1), S.BlinkTimer < 150);
  setMeter(stamm, clamp(S.Stamina/100,0,1), S.Stamina <= 0);
  const ic = S.Crouch ? 'hud_sneakicon' : 'hud_sprinticon';
  if($('stamic').dataset.k !== ic){ $('stamic').src = ASSETS[ic]; $('stamic').dataset.k = ic; }
  const m = $('msg'); const a = S.MsgTimer > 0 ? clamp(S.MsgTimer/(TICKS*1.0),0,1) : 0;
  m.textContent = S.MsgTimer > 0 ? S.Msg : ''; m.style.opacity = a;
  const h = $('hand'), pn = $('pickname');
  if(ClosestItem && !S.InvOpen && S.KillTimer>=0){ h.style.display='block'; h.style.transform=''; pn.style.display='block'; pn.textContent = ClosestItem.name; }
  else if(ClosestButton && !S.InvOpen && S.KillTimer>=0){ handAtButton(h); pn.style.display='none'; }
  else { h.style.display='none'; pn.style.display='none'; }
  $('cross').style.display = (ClosestItem || S.SelectedItem) ? 'none' : 'block';
  const v = $('visor');
  if(S.WearingHazmat){ v.style.display='block'; v.className='haz'; } else if(S.WearingGasMask){ v.style.display='block'; v.className=''; } else v.style.display='none';
  $('flash').style.opacity = flashT*0.8; $('hit').style.opacity = hitT;
  $('helpbar').style.display = S.InvOpen ? 'none' : 'block';
  if(S.Debug){
    const d = $('dbg'); d.style.display='block';
    d.textContent =
`Injuries:   ${S.Injuries.toFixed(2)}
Bloodloss:  ${S.Bloodloss.toFixed(2)}
Stamina:    ${S.Stamina.toFixed(1)}
CurrSpeed:  ${S.CurrSpeed.toFixed(4)}  (x70 = ${(S.CurrSpeed*70).toFixed(2)} u/s)
CrouchState:${S.CrouchState.toFixed(2)}
BlinkTimer: ${S.BlinkTimer.toFixed(0)} / ${S.BLINKFREQ.toFixed(0)}
BlurVolume: ${S.BlurVolume.toFixed(2)}
Vest/Haz/Gas: ${S.WearingVest}/${S.WearingHazmat}/${S.WearingGasMask}
FPSfactor:  ${F.toFixed(2)}   pos ${S.x.toFixed(2)}, ${S.y.toFixed(2)}, ${S.z.toFixed(2)}  LV ${LightVolume.toFixed(2)}
${S.GodMode ? 'GOD MODE' : ''}`;
  } else $('dbg').style.display='none';
}

/* ============================================================
   Inventory UI (layout/interaction from DrawGUI/UpdateGUI)
   ============================================================ */
const slotsEl = $('slots'), dragEl = $('drag');
const slotEls = [];
for(let n=0;n<MAX_ITEMS;n++){
  const d = document.createElement('div'); d.className='slot'; d.dataset.n = n;
  d.innerHTML = '<img alt=""><div class="nm"></div>'; slotsEl.appendChild(d); slotEls.push(d);
}
let drag = null;     // {item, from}
function showInv(open){
  $('inv').style.display = open ? 'block' : 'none';
  if(open) renderInv();
}
function wornFor(it){
  if(!it) return false;
  const t = it.t.tn;
  return (t==='vest'&&S.WearingVest===1) || (t==='finevest'&&S.WearingVest===2) || (t==='hazmatsuit'&&S.WearingHazmat===1) || (t==='gasmask'&&S.WearingGasMask===1);
}
function renderInv(){
  for(let n=0;n<MAX_ITEMS;n++){
    const it = Inventory[n], el = slotEls[n], img = el.firstChild;
    if(it && !(drag && drag.item===it && !el.classList.contains('hover'))){ img.src = ASSETS[it.t.icon]; img.style.display='block'; el.lastChild.textContent = it.name; }
    else { img.style.display='none'; el.lastChild.textContent = it? it.name : ''; }
    el.classList.toggle('worn', wornFor(it));
  }
}
function slotAt(e){ const t = document.elementFromPoint(e.clientX,e.clientY); const s = t && t.closest && t.closest('.slot'); return s ? +s.dataset.n : -1; }
slotsEl.addEventListener('pointermove', e=>{ const n = slotAt(e); slotEls.forEach((el,i)=>el.classList.toggle('hover', i===n && !!Inventory[i])); });
slotsEl.addEventListener('mouseleave', ()=>slotEls.forEach(el=>el.classList.remove('hover')));
function useDoubleClick(){ return doubleClick; }
$('inv').addEventListener('pointerdown', e=>{
  if(e.button!==0) return;
  const now = performance.now(); doubleClick = (now - lastHit1) < 800; lastHit1 = now;
  const n = slotAt(e);
  if(n>=0 && Inventory[n]) slotEls.forEach((el,i)=>el.classList.toggle('hover', i===n));   // name label on touch
  if(n<0 || !Inventory[n]) return;
  S.SelectedItem = Inventory[n];
  if(doubleClick){
    if(S.WearingHazmat > 0 && S.SelectedItem.t.tn !== 'hazmatsuit'){ setMsg('You cannot use any items while wearing a hazmat suit.', TICKS*5); S.SelectedItem = null; doubleClick=false; return; }
    sfx.pick(S.SelectedItem.t.snd);
    toggleInv(false, true); doubleClick = false; return;
  }
  drag = { item: S.SelectedItem, from: n };
  dragEl.src = ASSETS[drag.item.t.icon]; dragEl.style.display='block';
  moveDrag(e); renderInv();
});
function moveDrag(e){ const r = $('stage').getBoundingClientRect(); dragEl.style.left = (e.clientX - r.left - dragEl.offsetWidth/2)+'px'; dragEl.style.top = (e.clientY - r.top - dragEl.offsetHeight/2)+'px'; }
window.addEventListener('pointermove', e=>{ if(drag) moveDrag(e); });
window.addEventListener('pointerup', e=>{
  if(e.pointerType==='touch') slotEls.forEach(el=>el.classList.remove('hover'));
  if(!drag || e.button!==0) return;
  const it = drag.item, n = slotAt(e), hovered = document.elementFromPoint(e.clientX,e.clientY);
  const inInv = hovered && hovered.closest && hovered.closest('#slots');
  dragEl.style.display = 'none'; drag = null;
  if(!S.InvOpen){ renderInv(); return; }
  if(n >= 0){
    if(Inventory[n] === it){ S.SelectedItem = null; }
    else if(!Inventory[n]){ for(let z=0;z<MAX_ITEMS;z++) if(Inventory[z]===it) Inventory[z]=null; Inventory[n] = it; S.SelectedItem = null; sfx.pick('hard'); }
    else { setMsg('You cannot combine these two items.', TICKS*5); S.SelectedItem = null; }
  } else if(!inInv){
    const tn = it.t.tn;
    if(tn==='vest'||tn==='finevest'||tn==='hazmatsuit'){ setMsg('Double click on this item to take it off.', TICKS*5); S.SelectedItem = null; }
    else { dropItem(it); S.SelectedItem = null; toggleInv(false, false); }
  } else { S.SelectedItem = null; }
  renderInv();
});

window.addEventListener('pointercancel', ()=>{ if(drag){ dragEl.style.display='none'; drag=null; S.SelectedItem=null; renderInv(); } });

function toggleInv(open, keepSelected){
  if(open === S.InvOpen) return;
  S.InvOpen = open;
  showInv(open);
  if(open){ if(document.pointerLockElement) document.exitPointerLock(); S.mx1 = S.my1 = 0; }
  else { lockPointer(); S.mx1 = S.my1 = 0; rawDX = rawDY = 0; }
  if(!keepSelected) S.SelectedItem = null;
}
// Main.bb 3145 — Tab is blocked while a vest/hazmat is half-donned
function tryToggleInv(){
  if(S.KillTimer < 0) return;
  let w = '', v = 0;
  if(S.SelectedItem){ w = S.SelectedItem.t.tn; v = S.SelectedItem.state; }
  if((w!=='vest'&&w!=='finevest'&&w!=='hazmatsuit') || v===0 || v===100) toggleInv(!S.InvOpen, false);
}

/* ============================================================
   Input / pointer lock / screens
   ============================================================ */
function lockPointer(){
  if(!started || S.KillTimer<0 || touchMode) return;
  try{
    const p = view.requestPointerLock && view.requestPointerLock();
    if(p && p.catch) p.catch(()=>{ fallbackLook = true; });
  }catch(e){ fallbackLook = true; }
}
document.addEventListener('pointerlockchange', ()=>{
  locked = document.pointerLockElement === view;
  if(started && !conOpen && !locked && !S.InvOpen && S.KillTimer>=0 && !fallbackLook) $('pause').style.display='flex';
  else $('pause').style.display='none';
});
document.addEventListener('pointerlockerror', ()=>{ fallbackLook = true; $('pause').style.display='none'; showLockHint(); });
function showLockHint(){ setMsg('Mouse capture is blocked here: drag with the left mouse button to look (or use the arrow keys).', TICKS*8); }

function startGame(){
  audio(); if(AC && AC.state==='suspended') AC.resume();
  started = true;
  $('start').style.display='none'; $('pause').style.display='none';
  $('stage').classList.add('playing');
  if(touchMode){
    fallbackLook = true;
    try{ const el = document.documentElement; (el.requestFullscreen||el.webkitRequestFullscreen||function(){}).call(el); }catch(e){}
    try{ screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(()=>{}); }catch(e){}
  } else {
    lockPointer();
    setTimeout(()=>{ if(!document.pointerLockElement){ fallbackLook = true; showLockHint(); } }, 400);
  }
}
$('go').addEventListener('click', startGame);
$('resume').addEventListener('click', ()=>{ $('pause').style.display='none'; lockPointer(); if(AC && AC.state==='suspended') AC.resume(); });
$('respawn').addEventListener('click', respawn);
function respawn(){
  resetState(); $('stage').classList.remove('isdead'); $('dead').style.display='none'; showInv(false); $('held').style.display='none';
  lockPointer();
}

const BLOCK = new Set(['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ControlLeft']);
window.addEventListener('keydown', e=>{
  if(BLOCK.has(e.code) || (e.code==='F3')) e.preventDefault();
  if(!e.repeat){ hit[e.code] = true; }
  keys[e.code] = true;
  if(!started || conOpen) return;
  if(e.code==='Tab' && !e.repeat) tryToggleInv();
  if(e.code==='F3' && !e.repeat) S.Debug = !S.Debug;
  if(e.code==='KeyG' && !e.repeat){ S.GodMode = !S.GodMode; setMsg(S.GodMode ? 'GODMODE ON' : 'GODMODE OFF', TICKS*3); }
  if(e.code==='KeyH' && !e.repeat && S.KillTimer>=0 && !S.InvOpen){ shoot(1.0); }
  if(e.code==='KeyR' && !e.repeat) respawn();
  if(e.code==='KeyL' && !e.repeat) { /* spare */ }
});
window.addEventListener('keyup', e=>{ keys[e.code] = false; });
window.addEventListener('blur', ()=>{ for(const k in keys) keys[k]=false; });
window.addEventListener('mousemove', e=>{
  if(!started || S.InvOpen || touchMode) return;
  if(locked){ rawDX += e.movementX; rawDY += e.movementY; }
  else if(fallbackLook && (e.buttons & 1)){ rawDX += e.movementX; rawDY += e.movementY; dragMoved += Math.abs(e.movementX)+Math.abs(e.movementY); }
});
let dragMoved = 0, downOnView = false;
view.addEventListener('mousedown', e=>{
  if(!started || S.InvOpen || touchMode) return;
  dragMoved = 0; downOnView = true;
  if(e.button===0){ if(locked) mouseHit1 = true; }
  if(e.button===2) mouseHit2 = true;
});
window.addEventListener('mouseup', e=>{
  const wasDown = downOnView; if(e.button===0) downOnView = false;
  if(!started || S.InvOpen || locked || !wasDown) return;
  if(e.button===0 && fallbackLook && dragMoved < 6 && e.target===view) mouseHit1 = true;
});
view.addEventListener('contextmenu', e=>e.preventDefault());
document.addEventListener('contextmenu', e=>e.preventDefault());

/* ============================================================
   Touch controls: floating joystick (left), look drag (right), buttons
   ============================================================ */
const stageEl = $('stage'), tlayer = $('touch'), sbase = $('stickbase'), sknob = $('stickknob');
let stickId = null, stickC = null, lookId = null, lookLast = null, lookT = 0, lookMoved = 0;
function setTouchMode(on){
  if(touchMode === on) return;
  touchMode = on; stageEl.classList.toggle('touch', on); document.body.classList.toggle('touchmode', on);
  if(on) fallbackLook = true;
}
try{ if(window.matchMedia && matchMedia('(pointer:coarse)').matches && navigator.maxTouchPoints > 0) setTouchMode(true); }catch(e){}
window.addEventListener('pointerdown', e=>{ if(e.pointerType === 'touch') setTouchMode(true); }, true);
function rel(e){ const r = stageEl.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top, w:r.width, h:r.height }; }
function stickReset(){ stick.up = stick.dn = stick.l = stick.r = false; sbase.style.display = 'none'; stickId = null; }
tlayer.addEventListener('pointerdown', e=>{
  if(e.pointerType !== 'touch' || !started || S.InvOpen || S.KillTimer < 0) return;
  e.preventDefault(); try{ tlayer.setPointerCapture(e.pointerId); }catch(_){}
  const p = rel(e);
  if(p.x < p.w*0.45 && stickId === null){
    stickId = e.pointerId; stickC = { x:p.x, y:p.y };
    sbase.style.display = 'block'; sbase.style.left = p.x+'px'; sbase.style.top = p.y+'px'; sknob.style.transform = 'translate(-50%,-50%)';
  } else if(lookId === null){
    lookId = e.pointerId; lookLast = { x:e.clientX, y:e.clientY }; lookT = performance.now(); lookMoved = 0;
  }
});
tlayer.addEventListener('pointermove', e=>{
  if(e.pointerId === stickId){
    const p = rel(e), R = p.w*0.07;
    let dx = p.x - stickC.x, dy = p.y - stickC.y; const m = Math.hypot(dx,dy);
    if(m > R){ dx *= R/m; dy *= R/m; }
    sknob.style.transform = 'translate(calc(-50% + '+dx+'px), calc(-50% + '+dy+'px))';
    const nx = dx/R, ny = dy/R, T = 0.35;
    stick.up = ny < -T; stick.dn = ny > T; stick.l = nx < -T; stick.r = nx > T;
  } else if(e.pointerId === lookId){
    const dx = e.clientX - lookLast.x, dy = e.clientY - lookLast.y;
    lookLast = { x:e.clientX, y:e.clientY }; lookMoved += Math.abs(dx) + Math.abs(dy);
    if(S.KillTimer >= 0){ rawDX += dx*1.5; rawDY += dy*1.5; }
  }
});
function touchEnd(e){
  if(e.pointerId === stickId) stickReset();
  if(e.pointerId === lookId){
    if(e.type === 'pointerup' && lookMoved < 10 && performance.now() - lookT < 350) mouseHit1 = true;   // tap = pick up
    lookId = null;
  }
}
tlayer.addEventListener('pointerup', touchEnd); tlayer.addEventListener('pointercancel', touchEnd);
document.querySelectorAll('.tb').forEach(b=>{
  const a = b.dataset.act, hold = { sprint:'ShiftLeft', blink:'Space' }[a];
  b.addEventListener('pointerdown', e=>{
    e.preventDefault(); e.stopPropagation(); try{ b.setPointerCapture(e.pointerId); }catch(_){}
    b.classList.add('on');
    if(!started) return;
    if(hold){ keys[hold] = true; if(a === 'blink') hit.Space = true; }
    else if(a === 'inv') tryToggleInv();
    else if(a === 'pick') hit.KeyE = true;
    else if(a === 'put') hit.KeyQ = true;
    else if(a === 'crouch') hit.KeyC = true;
    else if(a === 'shot'){ if(S.KillTimer >= 0 && !S.InvOpen) shoot(1.0); }
    else if(a === 'reset') respawn();
    else if(a === 'console') setConsole(!conOpen);
  });
  const up = ()=>{ b.classList.remove('on'); if(hold) keys[hold] = false; };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
});

/* ============================================================
   Main loop
   ============================================================ */
let last = performance.now();
function frame(t){
  requestAnimationFrame(frame);
  const dt = Math.min((t-last)/1000, 0.1); last = t; nowMs = t;
  const paused = !started || conOpen || S.InvOpen || (!locked && !fallbackLook);
  F = paused ? 0 : clamp(dt*70, 0.2, 5.0);
  if(started){
    if(F > 0) updateWorld(); else renderHeld(null);
    if(S.KillTimer < -250 && !S.deadShown){
      S.deadShown = true; $('stage').classList.add('isdead'); stickReset();
      $('deadmsg').textContent = S.DeathMSG || 'Subject deceased.';
      $('dead').style.display = 'flex';
      if(document.pointerLockElement) document.exitPointerLock();
    }
  }
  render();
  updateHUD();
  if(S.InvOpen) renderInv();
  mouseHit1 = false; mouseHit2 = false;
  for(const k in hit) delete hit[k];
}


/* ============================================================
   Developer console (` or F4) — commands act on the live game state
   ============================================================ */
let conOpen = false;
const conEl = $('con'), conLog = $('conlog'), conIn = $('conin');
const conHist = []; let conHi = 0;
function conPrint(t, cls){ const d = document.createElement('div'); if(cls) d.className = cls; d.textContent = t; conLog.appendChild(d); conLog.scrollTop = conLog.scrollHeight; }
function setConsole(on){
  if(on === conOpen || !started) return;
  conOpen = on; conEl.classList.toggle('open', on);
  if(on){
    for(const k in keys) keys[k] = false;
    if(document.pointerLockElement) document.exitPointerLock();
    $('pause').style.display = 'none';
    if(!conLog.childElementCount) conPrint('SCP:CB web console — type "help"', 'ok');
    setTimeout(()=>conIn.focus(), 0);
  } else { conIn.blur(); if(!touchMode) lockPointer(); }
}
/* ============================================================
   Doors — port of Main.bb: Type Doors / CreateDoor (dir 0) / UpdateDoors / UseDoor
   Real models: GFX/map/Door01.x, DoorFrame.x, Button.x, ButtonKeycard.x.
   Door positions/states are the CreateDoor calls of Case "start" in MapSystem.bb.
   ============================================================ */
const DOORS = [];
let ClosestButton = null, ClosestDoor = null;
const DOOR_MODELS = {};
const K_ = 8/2048;
// MapSystem.bb CreateRoom "start" (rooms.ini [start] = GFX/map/173_opt.rmesh), room origin = (0,0,0).
// fields: CreateDoor(x, y, z, angle, big, dopen) + the flags set right after it. `test` marks my only deviations.
const DOOR_SPECS = [
  { name:'containment door', x:4000*K_, y:384*K_, z:1696*K_, angle:90, big:1, open:true,  locked:false, key:0, buttons:'none' },
  { name:'door (west corridor)', x:2704*K_, y:384*K_, z:624*K_, angle:90, big:0, open:false, locked:false, key:3, buttons:'both', test:'keycard 3 + buttons (source: none)' },
  { name:'door (open, locked)', x:1392*K_, y:384*K_, z:64*K_, angle:90, big:0, open:true, locked:true, key:0, buttons:'both' },
  { name:'door (west end)', x:-640*K_, y:384*K_, z:64*K_, angle:90, big:0, open:false, locked:false, key:0, buttons:'both', test:'unlocked (source: locked)' },
  { name:'door (control room)', x:1280*K_, y:384*K_, z:312*K_, angle:180, big:0, open:true, locked:true, key:0, buttons:'moved', single:true },
  { name:'door (chamber floor)', x:0, y:0, z:1184*K_, angle:0, big:0, open:false, locked:true, key:0, buttons:'both' },
  // CreateMap(): doors at the cell boundaries of the 4-way (shape ROOM4 always spawns all four). The north one joins the start room;
  // the other three lead to rooms that are not built yet, so they are locked (my addition).
  { name:'door (start room <-> 4-way)', x:0, y:0, z:-4, angle:0, big:0, open:false, locked:false, key:0, buttons:'both' },
  { name:'door (4-way east, no room yet)', x:4, y:0, z:-8, angle:90, big:0, open:false, locked:true, key:0, buttons:'both', test:'locked: no room behind it yet' },
  { name:'door (4-way west, no room yet)', x:-4, y:0, z:-8, angle:90, big:0, open:false, locked:true, key:0, buttons:'both', test:'locked: no room behind it yet' },
  { name:'door (4-way north, no room yet)', x:0, y:0, z:-12, angle:0, big:0, open:false, locked:true, key:0, buttons:'both', test:'locked: no room behind it yet' },
];
const wrap360 = a => ((a % 360) + 360) % 360;
function play2(path, x, y, z, range=10, vol=1){             // Main.bb PlaySound2(snd, Camera, entity, range, vol)
  const dx = x-S.x, dy = y-S.camY, dz = z-S.z, d = Math.hypot(dx,dy,dz);
  if(d >= range) return null;
  const side = (dx*cosD(S.yaw) + dz*sinD(S.yaw)) / Math.max(d, 0.01);
  return Eng.audio.play(path, { vol: (1 - d/range)*vol, pan: clamp(side, -1, 1) });
}
async function loadDoors(){
  const k = Eng.RoomScale;
  for(const n of ['Door01.x','DoorFrame.x','Button.x','ButtonKeycard.x','ContDoorLeft.x','ContDoorRight.x']) DOOR_MODELS[n] = await Eng.loadModel('GFX/map/'+n, ['GFX/map']);
  const b = DOOR_MODELS['Door01.x'].bbox, Wd = b[3]-b[0], Hd = b[4]-b[1], Dd = b[5]-b[2];
  DOOR_MODELS.slab = [204.0*k/Wd, 312.0*k/Hd, 16.0*k/Dd];       // ScaleEntity d\obj, 204*RoomScale/MeshWidth, ...
  resetDoors();
}
function frontOf(yaw){ const q = yaw*RAD; return [Math.sin(q), -Math.cos(q)]; }   // buttons face local -z
function resetDoors(){
  DOORS.length = 0; Eng.boxes.length = 0;
  for(const sp of DOOR_SPECS){
    const d = { name:sp.name, x:sp.x, y:sp.y, z:sp.z, angle:sp.angle, dir:sp.big, open:sp.open, openstate:0, off:0, zo:0, fastopen:0, keycard:sp.key, locked:sp.locked, timer:0, timerstate:0, single:!!sp.single, btn:[], test:sp.test };
    d.mdl = sp.big === 1 ? [DOOR_MODELS['ContDoorLeft.x'], DOOR_MODELS['ContDoorRight.x']] : [DOOR_MODELS['Door01.x'], DOOR_MODELS['Door01.x']];
    d.scale = sp.big === 1 ? [55*Eng.RoomScale, 55*Eng.RoomScale, 55*Eng.RoomScale] : DOOR_MODELS.slab;
    const a = sp.angle*RAD, rx = Math.cos(a), rz = Math.sin(a), fx = -Math.sin(a), fz = Math.cos(a);
    const loc = (lx, ly, lz) => [d.x + rx*lx + fx*lz, d.y + ly, d.z + rz*lx + fz*lz];
    if(sp.buttons === 'both'){
      d.btn = [ { p: loc(0.6, 0.7, -0.1), yaw: sp.angle, n: frontOf(sp.angle) }, { p: loc(-0.6, 0.7, 0.1), yaw: sp.angle+180, n: frontOf(sp.angle+180) } ];
    } else if(sp.buttons === 'moved'){   // PositionEntity buttons[0/1] to (x+1120, z+328 / z+296) — parent rotation keeps their yaws
      d.btn = [ { p:[1120*K_, d.y+0.7, 328*K_], yaw: sp.angle, n: frontOf(sp.angle) }, { p:[1120*K_, d.y+0.7, 296*K_], yaw: sp.angle+180, n: frontOf(sp.angle+180) } ];
    }
    d.boxes = [Eng.addBox(0,0,0,0,0,0), Eng.addBox(0,0,0,0,0,0)];
    if(d.single) d.boxes[1].on = false;
    if(d.open){ for(let i = 0; i < 400 && d.openstate < 180; i++) stepDoor(d, 1, true); }   // created open: let it finish sliding
    else d.zo = d.dir === 0 ? DOOR_ZO : 0;
    DOORS.push(d); doorBoxes(d);
  }
}
const DOOR_ZO = 8.0 * (8/2048);                       // MoveEntity d\obj, 0, 0, 8*RoomScale when closed (dir 0)
function slabMatrix(d, i){
  const a = d.angle*RAD, rx = Math.cos(a), rz = Math.sin(a), fx = -Math.sin(a), fz = Math.cos(a);
  if(d.dir === 0){
    const s = i ? -1 : 1;
    return Eng.mat.trs([d.x + s*(rx*d.off + fx*d.zo), d.y, d.z + s*(rz*d.off + fz*d.zo)], d.angle + (i ? 180 : 0), 0, 0, d.scale);
  }
  const s = i ? -1 : 1;                                // big door: both halves keep the frame's yaw, move in opposite directions
  return Eng.mat.trs([d.x + s*rx*d.off, d.y, d.z + s*rz*d.off], d.angle, 0, 0, d.scale);
}
function doorBoxes(d){
  for(let i = 0; i < 2; i++){
    const b = d.boxes[i]; if(d.single && i) { b.on = false; continue; }
    const M = slabMatrix(d, i), bb = d.mdl[i].bbox; let lo = [1e9,1e9,1e9], hi = [-1e9,-1e9,-1e9];
    for(const x of [bb[0], bb[3]]) for(const y of [bb[1], bb[4]]) for(const z of [bb[2], bb[5]]){
      const p = Eng.mat.xfPoint(M, x, y, z); for(let c = 0; c < 3; c++){ lo[c] = Math.min(lo[c], p[c]); hi[c] = Math.max(hi[c], p[c]); }
    }
    b.x0 = lo[0]; b.y0 = lo[1]; b.z0 = lo[2]; b.x1 = hi[0]; b.y1 = hi[1]; b.z1 = hi[2]; b.on = true;
  }
}
function doorSfx(d, open){
  const f = d.dir === 1 ? 'SFX/Door/BigDoor' + (open ? 'Open' : 'Close') + rand(1,2) + '.ogg' : 'SFX/Door/Door' + (open ? 'Open' : 'Close') + rand(1,3) + '.ogg';
  play2(f, d.x, d.y+0.6, d.z);
}
// Main.bb UseDoor (dir 0 / keycard / locked branches)
function useDoor(d, showmsg=true, playsfx=true){
  const kmsg = () => { const kc = S.Msg.includes('The keycard') || S.Msg.includes('A keycard with'); return !kc || S.MsgTimer < TICKS*3; };
  if(d.keycard > 0){
    if(!S.SelectedItem){ if(showmsg && kmsg()) setMsg('A keycard is required to operate this door.', TICKS*7); return; }
    const m = /^key(\d)$/.exec(S.SelectedItem.t.tn), lvl = m ? +m[1] : -1;
    if(lvl === -1){ if(showmsg && kmsg()) setMsg('A keycard is required to operate this door.', TICKS*7); return; }
    else if(lvl >= d.keycard){
      S.SelectedItem = null;
      if(showmsg){
        if(d.locked){ smp('SFX/Interact/KeycardUse2.ogg', .9); setMsg('The keycard was inserted into the slot but nothing happened.', TICKS*7); return; }
        smp('SFX/Interact/KeycardUse1.ogg', .9); setMsg('The keycard was inserted into the slot.', TICKS*7);
      }
    } else {
      S.SelectedItem = null;
      if(showmsg){ smp('SFX/Interact/KeycardUse2.ogg', .9); setMsg(d.locked ? 'The keycard was inserted into the slot but nothing happened.' : 'A keycard with security clearance '+d.keycard+' or higher is required to operate this door.', TICKS*7); }
      return;
    }
  } else if(d.locked){
    if(showmsg){ smp('SFX/Interact/Button2.ogg', .9); setMsg(d.open ? 'You pushed the button but nothing happened.' : 'The door appears to be locked.', TICKS*5); }
    return;
  }
  d.open = !d.open;
  if(playsfx) doorSfx(d, d.open);
  if(d.open) d.timerstate = d.timer;
}
function stepDoor(d, f, silent){          // Main.bb UpdateDoors, movement part (Case 0 and Case 1)
  const K = d.fastopen + 1;
  if(d.open){
    if(d.openstate < 180){
      if(d.dir === 1){ d.openstate = Math.min(180, d.openstate + f*0.8); d.off += sinD(d.openstate) * f / 180.0; }
      else { d.openstate = Math.min(180, d.openstate + f*2*K); d.off += sinD(d.openstate) * (d.fastopen*2+1) * f / 80.0; }
    } else {
      d.fastopen = 0;
      if(d.timerstate > 0){ d.timerstate = Math.max(0, d.timerstate - f); if(d.timerstate === 0 && !silent){ d.open = false; doorSfx(d, false); } }
    }
  } else if(d.openstate > 0){
    if(d.dir === 1){ d.openstate = Math.max(0, d.openstate - f*0.8); d.off -= sinD(d.openstate) * f / 180.0; }
    else { d.openstate = Math.max(0, d.openstate - f*2*K); d.off -= sinD(d.openstate) * f * K / 80.0; }
    if(d.openstate <= 0){ d.fastopen = 0; d.off = 0; d.zo = d.dir === 0 ? DOOR_ZO : 0; }
  } else { d.fastopen = 0; d.off = 0; d.zo = d.dir === 0 ? DOOR_ZO : 0; }
}
function updateDoors(){
  ClosestButton = null; ClosestDoor = null;
  const alive = S.KillTimer >= 0 && !S.InvOpen && !conOpen;
  let bestD = 99;
  for(const d of DOORS){
    if((d.openstate >= 180 || d.openstate <= 0) && alive){
      for(const b of d.btn){
        if(Math.abs(S.x-b.p[0]) < 1.0 && Math.abs(S.z-b.p[2]) < 1.0){
          const hd = Math.hypot(S.x-b.p[0], S.z-b.p[2]);
          if(hd < 0.7){
            const dx = b.p[0]-S.x, dy = b.p[1]-S.camY, dz = b.p[2]-S.z, dd = Math.hypot(dx,dy,dz);
            const front = (S.x-b.p[0])*b.n[0] + (S.z-b.p[2])*b.n[1] > 0;      // EntityPick(temp, 0.6) only reaches the button from its front
            if(dd <= 0.6 && front && hd < bestD){ bestD = hd; ClosestButton = b; ClosestDoor = d; }
          }
        }
      }
    }
    stepDoor(d, F, false);
    doorBoxes(d);
  }
  if(ClosestButton && (mouseHit1 || hit.KeyE)){
    mouseHit1 = false;
    play2('SFX/Interact/Button.ogg', ClosestButton.p[0], ClosestButton.p[1], ClosestButton.p[2]);
    useDoor(ClosestDoor, true);
  }
}
function pushDoors(list){
  const k = Eng.RoomScale, A = 0.5, D = 0.5;
  for(const d of DOORS){
    if(d.dir === 0) list.push({ mdl:DOOR_MODELS['DoorFrame.x'], M:Eng.mat.trs([d.x,d.y,d.z], d.angle,0,0,[k,k,k]), amb:A, dir:D });
    list.push({ mdl:d.mdl[0], M:slabMatrix(d, 0), amb:A, dir:D });
    if(!d.single) list.push({ mdl:d.mdl[1], M:slabMatrix(d, 1), amb:A, dir:D });
    d.btn.forEach(b => list.push({ mdl:DOOR_MODELS[d.keycard > 0 ? 'ButtonKeycard.x' : 'Button.x'], M:Eng.mat.trs(b.p, b.yaw, 0, 0, [.03,.03,.03]), amb:A, dir:D }));
  }
}
// DrawGUI: hand icon at the button's direction relative to the view
function handAtButton(h){
  const b = ClosestButton, dx = b.p[0]-S.x, dy = b.p[1]-S.camY, dz = b.p[2]-S.z;
  const yTo = Math.atan2(-dx, dz)/RAD, pTo = Math.atan2(-dy, Math.hypot(dx,dz))/RAD;
  let yv = wrap360(S.yaw - yTo), pv = wrap360(S.pitch - pTo);
  if(yv > 90 && yv <= 180) yv = 90; if(yv > 180 && yv < 270) yv = 270;
  if(pv > 90 && pv <= 180) pv = 90; if(pv > 180 && pv < 270) pv = 270;
  h.style.display = 'block';
  h.style.transform = `translate(${(sinD(yv)*100/3).toFixed(2)}cqw, ${(-sinD(pv)*100/ASPECT/3).toFixed(2)}cqw)`;
}
function doorCmd(a){
  if(!a.length) return DOORS.map((d,i) => `${i}: ${d.name}  ${d.open ? 'open' : 'closed'}${d.locked ? ' LOCKED' : ''}  key ${d.keycard}  at ${d.x.toFixed(1)}, ${d.z.toFixed(1)}`).join('\n');
  const list = a[0] === 'all' ? DOORS : [DOORS[+a[0]]];
  if(list.some(d => !d)) throw 'usage: door [<n>|all] [open|close|toggle|lock|unlock]  (no args: list)';
  const m = (a[1] || 'toggle').toLowerCase();
  for(const d of list){
    if(m === 'open') d.open = true; else if(m === 'close') d.open = false; else if(m === 'toggle') d.open = !d.open;
    else if(m === 'lock') d.locked = true; else if(m === 'unlock') d.locked = false; else throw 'usage: door [<n>|all] [open|close|toggle|lock|unlock]';
  }
  return 'ok';
}

const CON = {
  help(){ return 'commands: help, clear, door [<n>|all] [open|close|toggle|lock|unlock], guard [on|off|toggle|reset|here|status], godmode [on|off], heal, hurt <n>, shoot, kill, tp <x> <y> <z>, pos, give <item>, items, debug, reset, close'; },
  clear(){ conLog.textContent = ''; },
  close(){ setConsole(false); },
  door(a){ return doorCmd(a); },
  guard(a){
    const m = (a[0]||'status').toLowerCase();
    if(m==='on') GUARD.enabled = true;
    else if(m==='off') GUARD.enabled = false;
    else if(m==='toggle') GUARD.enabled = !GUARD.enabled;
    else if(m==='reset'){ GUARD.enabled = true; resetGuard(); return 'guard re-armed at spawn point'; }
    else if(m==='here'){ GUARD.x = S.x + Math.sin(S.yaw*RAD)*-2; GUARD.z = S.z + Math.cos(S.yaw*RAD)*2; const g = Eng.groundAt(GUARD.x, S.camY, GUARD.z, 12); GUARD.y = g ? g.y : S.camY-1.25; GUARD.on = false; return 'guard moved in front of you'; }
    else if(m!=='status') throw 'usage: guard [on|off|toggle|reset|here|status]';
    return 'guard ' + (GUARD.enabled ? 'ENABLED' : 'DISABLED') + (GUARD.enabled && GUARD.on ? ' (alerted)' : '');
  },
  godmode(a){ S.GodMode = a[0] ? a[0]==='on' || a[0]==='1' : !S.GodMode; return 'godmode ' + (S.GodMode?'ON':'OFF'); },
  heal(){ S.Injuries = 0; S.Bloodloss = 0; S.Infect = 0; return 'healed'; },
  hurt(a){ S.Injuries += parseFloat(a[0]||'0.5'); return 'injuries = ' + S.Injuries.toFixed(2); },
  shoot(){ shoot(1.0); return 'bang'; },
  kill(){ const g = S.GodMode; S.GodMode = false; kill(); S.GodMode = g; return 'killed'; },
  pos(){ return `x ${S.x.toFixed(2)}  y ${S.camY.toFixed(2)}  z ${S.z.toFixed(2)}  yaw ${S.yaw.toFixed(0)}`; },
  tp(a){ const n = a.map(Number); if(n.length<3 || n.some(isNaN)) throw 'usage: tp <x> <y> <z>'; S.x=n[0]; S.camY=n[1]; S.z=n[2]; return 'teleported'; },
  items(){ return Object.keys(TPL).join(' '); },
  give(a){
    const tp = TPL[a[0]]; if(!tp) throw 'unknown item (see "items")';
    const g = Eng.groundAt(S.x, S.camY, S.z, 12);
    const it = { id:++lastItemId, t:tp, name:tp.name, x:S.x, z:S.z, y:(g?g.y:S.camY-1.2)+0.01, vy:0, yaw:rand(0,359), picked:false, state:0, dist:99 };
    const m = tp.mdlData; if(m){ it.mdl = m.mdl; it.sc = m.sc; }
    items.push(it); return 'spawned ' + tp.name + ' at your feet';
  },
  debug(){ S.Debug = !S.Debug; return 'debug ' + (S.Debug?'ON':'OFF'); },
  reset(){ respawn(); return 'reset'; }
};
function conRun(line){
  conPrint('> ' + line, 'cmd');
  const p = line.trim().split(/\s+/); const f = CON[p[0].toLowerCase()];
  if(!f){ conPrint('unknown command "' + p[0] + '" — try help', 'err'); return; }
  try{ const r = f(p.slice(1)); if(r) conPrint(r); }catch(e){ conPrint(String(e), 'err'); }
}
conIn.addEventListener('keydown', e=>{
  e.stopPropagation();
  if(e.code==='Backquote' || e.code==='F4' || e.code==='Escape'){ e.preventDefault(); setConsole(false); return; }
  if(e.code==='Enter'){ const v = conIn.value; conIn.value = ''; if(v.trim()){ conHist.push(v); conHi = conHist.length; conRun(v); } }
  else if(e.code==='ArrowUp'){ e.preventDefault(); if(conHi>0) conIn.value = conHist[--conHi]; }
  else if(e.code==='ArrowDown'){ e.preventDefault(); conHi = Math.min(conHi+1, conHist.length); conIn.value = conHist[conHi] || ''; }
});
conIn.addEventListener('keyup', e=>e.stopPropagation());
conEl.addEventListener('pointerdown', e=>e.stopPropagation());
window.addEventListener('keydown', e=>{
  if((e.code==='Backquote' || e.code==='F4') && !e.repeat){ e.preventDefault(); setConsole(!conOpen); }
}, true);

/* ============================================================
   Boot — fetch manifest, room, props, item models and sounds, then enable the button
   ============================================================ */
const ITEM_SPOTS = [['vest',12.0,5.2],['finevest',13.0,5.2],['veryfinevest',14.0,5.2],['hazmatsuit',15.0,5.2],['firstaid',16.0,5.2],['finefirstaid',17.0,5.2],['firstaid2',12.0,6.4],['veryfinefirstaid',13.0,6.4],['scp500',14.0,6.4],['gasmask',15.0,6.4],['eyedrops',16.0,6.4],['eyedropsred',17.0,6.4],['fineeyedrops',12.0,7.6],['key1',13.0,7.6],['key3',14.0,7.6],['doc173',15.0,7.6],['bat',16.0,7.6],['killbat',17.0,7.6]];

/* Test guard: NPCs.bb NPCtypeGuard (GFX/npcs/guard.b3d, scale 0.29/2.5 from Data/NPCs.ini). Opens fire when you walk in. */
const GUARD = { x:15.0, z:9.2, y:1.5, yaw:180, on:false, cd:0, flash:0, mdl:null, enabled:true };
function resetGuard(){ const g = Eng.groundAt(GUARD.x, SPAWN.y-0.5, GUARD.z, 12); GUARD.y = g ? g.y : 1.5; GUARD.on = false; GUARD.cd = 0; GUARD.flash = 0; GUARD.yaw = 180; }
function updateGuard(){
  if(!GUARD.enabled) return;
  GUARD.flash = Math.max(GUARD.flash - F, 0);
  if(S.KillTimer < 0) return;
  const dx = S.x-GUARD.x, dz = S.z-GUARD.z, d = Math.hypot(dx,dz);
  const los = Eng.segClear(GUARD.x, GUARD.y+1.3*0.9, GUARD.z, S.x, S.camY, S.z);
  if(!GUARD.on && S.z > 4.9 && d < 12 && los){ GUARD.on = true; GUARD.cd = 45; setMsg('"Halt! Intruder in the chamber!"', TICKS*3); }
  if(!GUARD.on) return;
  GUARD.yaw = wrap(Math.atan2(-dx, dz)/RAD);
  if(!los) return;
  GUARD.cd -= F;
  if(GUARD.cd <= 0){ GUARD.flash = 6; shoot(clamp(0.9 - d*0.05, 0.35, 0.8)); GUARD.cd = TICKS*rnd(0.9,1.6); }
}
const SOUND_LIST = [
  ...[0,1,2,3].map(i=>'SFX/Interact/PickItem'+i+'.ogg'),
  ...[1,2,3,4,5,6,7,8].flatMap(i=>['Step','Run','StepMetal','RunMetal'].map(n=>'SFX/Step/'+n+i+'.ogg')),
  'SFX/Character/D9341/Damage1.ogg','SFX/Interact/Button.ogg','SFX/Interact/Button2.ogg','SFX/Interact/KeycardUse1.ogg','SFX/Interact/KeycardUse2.ogg','SFX/Door/DoorOpen1.ogg','SFX/Door/DoorOpen2.ogg','SFX/Door/DoorOpen3.ogg','SFX/Door/DoorClose1.ogg','SFX/Door/DoorClose2.ogg','SFX/Door/DoorClose3.ogg','SFX/Door/BigDoorOpen1.ogg','SFX/Door/BigDoorOpen2.ogg','SFX/Door/BigDoorClose1.ogg','SFX/Door/BigDoorClose2.ogg','SFX/General/Gunshot.ogg','SFX/General/BulletHit.ogg','SFX/Character/D9341/Heartbeat.ogg',
  ...[0,1,2,3,4].flatMap(i=>['SFX/Character/D9341/breath'+i+'.ogg','SFX/Character/D9341/breath'+i+'gas.ogg']),
  ...[0,1,2,3].map(i=>'SFX/Character/D9341/BloodDrip'+i+'.ogg'),
];
const AMB_FILES = { 4:'SFX/Ambient/Room ambience/ventilation.ogg' };   // RoomAmbience table index 4 (MapSystem.bb)
async function boot(){
  const go = $('go'), warn = $('lockwarn');
  const tick = setInterval(()=>{ go.textContent = 'LOADING ' + Math.round(Eng.progress()*100) + '%'; }, 120);
  try{
    Eng.init(view);
    await Eng.loadManifest();
    await Eng.loadMaterials('Data/materials.ini');
    audio();
    const roomP = (async () => { const r = await Eng.loadRoom('GFX/map/173_opt.rmesh', { defer:true }); await Eng.loadRoom('GFX/map/room4_2_opt.rmesh', { into:r, x:0, z:-8, yaw:0, defer:true }); Eng.finishRoom(r); return r; })();
    const sndP = Eng.audio.loadAll([...SOUND_LIST, ...Object.values(AMB_FILES)]);
    ROOM = await roomP;
    // item models (shared meshes, per-template texture override)
    const tex = {};
    for(const [k,[path,sc,texPath]] of Object.entries(MODEL)){
      const base = await Eng.loadModel(path, ['GFX/items']);
      let parts = base.parts;
      if(texPath){ const t = await Eng.getTexture(texPath, ['GFX/items','']); parts = parts.map(p=>Object.assign({}, p, { tex:t, color:[1,1,1,1] })); }
      tex[k] = { mdl:{ parts }, sc };
    }
    window.__ITEMMODEL = tex;
    GUARD.mdl = await Eng.loadModel('GFX/npcs/guard.b3d', ['GFX/npcs']);
    await loadDoors();
    for(const [k,m] of Object.entries(tex)) TPL[k].mdlData = m;
    await sndP;
    for(const e of ROOM.sounds){ const f = AMB_FILES[e.id]; if(f) AMB.push({ file:f, x:e.x, y:e.y, z:e.z, range:e.range, h:null }); }
    for(const k of Object.keys(ASSETS)){ const r = Eng.real(ASSETS[k]); ASSETS[k] = r ? encodeURI(r) : ''; }
    $('blinkic').src = ASSETS.hud_blinkicon; $('stamic').src = ASSETS.hud_sprinticon; $('hand').src = ASSETS.hud_hand;
    resetState();
    for(const it of items){ const m = it.t.mdlData; if(m){ it.mdl = m.mdl; it.sc = m.sc; } }
    clearInterval(tick); go.disabled = false; go.textContent = 'ENTER THE CHAMBER';
    requestAnimationFrame(frame);
  }catch(e){
    clearInterval(tick); console.error(e);
    go.textContent = 'FAILED TO LOAD';
    warn.textContent = (location.protocol === 'file:' ? 'This page must be served over HTTP (run start_server.bat / start_server.sh in this folder, then open http://localhost:8000). ' : '') + String(e.message || e);
  }
}
window.__scp = { DOORS, useDoor, GUARD, CON, conRun, setConsole, S, Inventory, get items(){return items;}, keys, hit, TPL, setF:(v)=>{F=v;}, pickItem, shoot, dropItem, kill, get F(){return F;}, Eng, get ROOM(){return ROOM;} };

boot();
})();
