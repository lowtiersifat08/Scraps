const $ = id => document.getElementById(id);
const audio = $('audio');
const screens = [$('menu'), $('game'), $('result')];
const travelOptions = [3.4, 2.8, 2.2, 1.7, 1.35];
const speedNames = ['VERY SLOW','SLOW','NORMAL','FAST','VERY FAST'];
let travelSeconds = travelOptions[2], raf = 0, notes = [], chartIndex = 0;
let active = false, paused = false, audioStarted = false, audioStarting = false, preRollAt = 0, pausedClock = 0;
let score = 0, combo = 0, maxCombo = 0, hits = 0, misses = 0;
let activeHold = null, judgeTimer = 0, trackUrl = null, pointerStart = null;
const duration = () => Number.isFinite(audio.duration) ? audio.duration : window.SONG_DURATION;
const fmt = t => { t=Math.max(0,Math.floor(t)); return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`; };
$('speed').addEventListener('input', () => {
  travelSeconds = travelOptions[+$('speed').value-1];
  $('speedName').textContent = speedNames[+$('speed').value-1];
});
$('songPicker').addEventListener('change', e => {
  const file=e.target.files && e.target.files[0]; if(!file)return;
  if(trackUrl)URL.revokeObjectURL(trackUrl);
  trackUrl=URL.createObjectURL(file); audio.src=trackUrl;
  $('trackName').textContent=file.name.replace(/\.[^.]+$/,'');
  $('gameSongName').textContent=$('trackName').textContent;
  $('trackMeta').textContent='Custom MP3 selected';
});
$('playBtn').addEventListener('click',startGame); $('retryBtn').addEventListener('click',startGame);
$('backBtn').addEventListener('click',toMenu); $('exitBtn').addEventListener('click',toMenu);
$('pauseBtn').addEventListener('click',()=>paused?resumeGame():pauseGame());
$('resumeBtn').addEventListener('click',resumeGame);
function showScreen(target){screens.forEach(s=>s.classList.add('hidden'));target.classList.remove('hidden');}
function startGame(){
  if(!audio.src)return;
  cancelAnimationFrame(raf);audio.pause();try{audio.currentTime=0;}catch(e){}
  notes.forEach(n=>n.el.remove());notes=[];chartIndex=0;activeHold=null;pointerStart=null;
  score=0;combo=0;maxCombo=0;hits=0;misses=0;active=true;paused=false;audioStarted=false;audioStarting=false;
  $('score').textContent='000000';$('combo').textContent='0';$('judgeText').textContent='';
  $('pauseOverlay').classList.add('hidden');$('pauseBtn').textContent='Ⅱ PAUSE';
  $('progressFill').style.width='0%';$('progressText').textContent=`0:00 / ${fmt(duration())}`;
  $('gameSongName').textContent=$('trackName').textContent;
  preRollAt=performance.now();showScreen($('game'));loop();
}
function songClock(now){
  if(audioStarted)return audio.currentTime;
  return (now-preRollAt)/1000-travelSeconds;
}
function loop(){
  if(!active||paused)return;
  const now=performance.now(), elapsed=(now-preRollAt)/1000;
  if(!audioStarted && elapsed>=travelSeconds && !audioStarting){
    audioStarting=true;
    audio.play().then(()=>{audioStarted=true;audioStarting=false;preRollAt=performance.now()-travelSeconds*1000;loop();}).catch(()=>{audioStarting=false;active=false;alert('The MP3 could not be played in this preview. Check assets/song.mp3 or choose the MP3 again.');toMenu();});
  }
  if(audioStarting)return;
  const songTime=songClock(now), field=$('field'), h=field.clientHeight;
  const hitY=h*.83, pxPerSec=hitY/travelSeconds;
  const spawnLimit=songTime+travelSeconds;
  while(chartIndex<window.SONG_CHART.length && window.SONG_CHART[chartIndex].time<=spawnLimit){
    const data=window.SONG_CHART[chartIndex++];
    const el=document.createElement('div');el.className=`note ${data.type} l${data.lane}`;
    if(data.type==='hold'){
      const tail=document.createElement('i');tail.className='hold-tail';el.appendChild(tail);
      const head=document.createElement('i');head.className='hold-head';el.appendChild(head);
    } else if(data.type==='flick'){
      el.classList.add('flick-'+data.direction);el.innerHTML=`<span>${data.direction==='up'?'↑':data.direction==='down'?'↓':data.direction==='left'?'←':'→'}</span>`;
    } else if(data.type==='reverse') el.innerHTML='<span>↟</span>';
    else if(data.type==='slide') el.innerHTML='<span>◆</span>';
    $('notes').appendChild(el);
    notes.push({...data,el,done:false,holding:false});
  }
  for(const n of notes){
    if(n.done)continue;
    const delta=n.time-songTime;
    let y, top, height=16;
    if(n.type==='reverse') y=hitY+delta*pxPerSec;
    else y=hitY-delta*pxPerSec;
    if(n.type==='hold'){
      const tailY=hitY-(n.time+n.duration-songTime)*pxPerSec;
      top=tailY;height=Math.max(16,y-tailY);
      n.el.style.top=`${top}px`;n.el.style.height=`${height}px`;
      n.el.querySelector('.hold-head').style.top=`${Math.max(0,y-top-7)}px`;
      n.el.querySelector('.hold-tail').style.top='0px';
    } else {
      n.el.style.top=`${y}px`;n.el.style.height='18px';
    }
    if(n.type==='slide'){
      const progress=Math.max(0,Math.min(1,(songTime-(n.time-travelSeconds))/travelSeconds));
      const from=n.fromLane??n.lane, x=from*25+(n.lane-from)*25*progress;
      n.el.style.left=`calc(${x}% + 3.75%)`;
    } else n.el.style.left=`calc(${n.lane*25}% + 3.75%)`;
    if(n.type==='reverse')n.el.style.transform='translateY(-50%) rotate(180deg)';
    if(n.type==='hold' && n.holding && songTime>=n.time+n.duration)completeHold(n);
    else if(!n.holding && songTime-n.time>(n.type==='hold'?0.2:0.22))missNote(n);
  }
  notes=notes.filter(n=>!n.done);
  if(audioStarted){
    const d=duration();$('progressFill').style.width=`${Math.min(100,audio.currentTime/d*100)}%`;
    $('progressText').textContent=`${fmt(audio.currentTime)} / ${fmt(d)}`;
    // Stop at the actual audio endpoint. Never let chart-only events extend the stage.
    if(audio.ended || audio.currentTime>=d-0.025){finish();return;}
  } else {
    $('progressText').textContent=`READY · ${fmt(duration())}`;
  }
  raf=requestAnimationFrame(loop);
}
function updateHud(){$('score').textContent=String(score).padStart(6,'0');$('combo').textContent=combo;}
function judgeText(t){$('judgeText').textContent=t;clearTimeout(judgeTimer);judgeTimer=setTimeout(()=>$('judgeText').textContent='',390);}
function registerHit(n,delta){
  n.done=true;n.el.classList.add('hit');setTimeout(()=>n.el.remove(),120);
  hits++;combo++;maxCombo=Math.max(maxCombo,combo);
  const label=delta<=.055?'PERFECT':delta<=.11?'GREAT':'GOOD';
  score+=label==='PERFECT'?1000:label==='GREAT'?700:400;updateHud();judgeText(label);
}
function missNote(n){if(n.done)return;n.done=true;n.el.remove();misses++;combo=0;updateHud();judgeText('MISS');}
function completeHold(n){if(n.done)return;n.done=true;n.el.remove();hits++;combo++;maxCombo=Math.max(maxCombo,combo);score+=1400;updateHud();judgeText('HOLD COMPLETE');if(activeHold===n)activeHold=null;}
function laneAt(x){const r=$('field').getBoundingClientRect();return Math.max(0,Math.min(3,Math.floor((x-r.left)/(r.width/4))));}
function nearestNote(lane,time,types){return notes.filter(n=>!n.done&&n.lane===lane&&types.includes(n.type)).sort((a,b)=>Math.abs(a.time-time)-Math.abs(b.time-time))[0];}
function pointerDown(e){
  if(!active||paused)return;
  const lane=laneAt(e.clientX),time=audioStarted?audio.currentTime:Math.max(0,(performance.now()-preRollAt)/1000-travelSeconds);
  pointerStart={x:e.clientX,y:e.clientY,lane,id:e.pointerId,time};
  const n=nearestNote(lane,time,['hold','tap','reverse','slide']);
  if(n && Math.abs(n.time-time)<=.22){
    if(n.type==='hold'){
      n.holding=true;activeHold=n;judgeText('HOLD');
    } else registerHit(n,Math.abs(n.time-time));
  }
}
function pointerUp(e){
  if(!pointerStart)return;
  const start=pointerStart;pointerStart=null;
  if(!active||paused)return;
  const now=audioStarted?audio.currentTime:Math.max(0,(performance.now()-preRollAt)/1000-travelSeconds);
  const dx=e.clientX-start.x,dy=e.clientY-start.y;
  const dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
  const flick=nearestNote(start.lane,now,['flick']);
  if(flick && Math.abs(flick.time-now)<=.24){
    if(flick.direction===dir)registerHit(flick,Math.abs(flick.time-now));else missNote(flick);
  }
  if(activeHold && activeHold.holding && e.pointerId===start.id){
    const holdTime=activeHold.time+activeHold.duration;
    if(now<holdTime-.08){missNote(activeHold);activeHold.holding=false;activeHold=null;}
  }
}
$('field').addEventListener('pointerdown',pointerDown);
document.addEventListener('pointerup',pointerUp);
document.addEventListener('pointercancel',pointerUp);
function pauseGame(){if(!active||paused)return;if(!audioStarted)pausedClock=songClock(performance.now());paused=true;audio.pause();cancelAnimationFrame(raf);$('pauseOverlay').classList.remove('hidden');$('pauseBtn').textContent='▶ RESUME';}
function resumeGame(){if(!paused)return;paused=false;$('pauseOverlay').classList.add('hidden');$('pauseBtn').textContent='Ⅱ PAUSE';if(audioStarted)audio.play().then(loop);else{preRollAt=performance.now()-(pausedClock+travelSeconds)*1000;loop();}}
function finish(){active=false;paused=false;cancelAnimationFrame(raf);audio.pause();for(const n of notes){if(!n.done){n.done=true;n.el.remove();misses++;}}notes=[];activeHold=null;
  const total=window.SONG_CHART.length,accuracy=total?hits/total*100:0;
  $('rank').textContent=accuracy>=95?'S':accuracy>=85?'A':accuracy>=70?'B':accuracy>=50?'C':'D';
  $('finalScore').textContent=score.toLocaleString();$('hitCount').textContent=hits;$('missCount').textContent=misses;$('bestCombo').textContent=maxCombo;$('accuracy').textContent=accuracy.toFixed(1)+'%';showScreen($('result'));
}
function toMenu(){active=false;paused=false;cancelAnimationFrame(raf);audio.pause();try{audio.currentTime=0;}catch(e){}notes.forEach(n=>n.el.remove());notes=[];activeHold=null;$('pauseOverlay').classList.add('hidden');showScreen($('menu'));}
audio.addEventListener('ended',()=>{if(active&&audioStarted)finish();});
audio.addEventListener('loadedmetadata',()=>{$('trackMeta').textContent=`Your supplied song · ${fmt(audio.duration)}`;});
