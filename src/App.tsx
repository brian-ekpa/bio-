import { type CSSProperties, type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  SiDiscord, SiGithub, SiInstagram, SiLastdotfm, SiTiktok, SiWhatsapp,
} from 'react-icons/si';
import {
  AudioLines, Check, ChevronRight, Disc3, Eye, MapPin, MessageCircle, Music2, Pause, Play,
  RotateCcw,
  Settings2, SkipBack, SkipForward, Upload, Volume2, X,
} from 'lucide-react';
import {
  getGetLastFmRecentTrackQueryKey, getGetVisitorCountQueryKey,
  useGetLastFmRecentTrack, useGetVisitorCount, useRecordVisitorVisit,
} from '@workspace/api-client-react';

// These types describe the values returned by the external presence service
// and the options that can be selected in the page customizer.
type ThemeMode = 'liquid' | 'classic' | 'solid' | 'outline' | 'frosted';
type Presence = 'online' | 'idle' | 'dnd' | 'offline';
type LanyardActivity = { type: number; name: string; details?: string | null; state?: string | null };
type LanyardUser = { id: string; username: string; global_name?: string | null; avatar?: string | null };
type LanyardData = {
  discord_status: Presence;
  discord_user: LanyardUser;
  activities?: LanyardActivity[];
  listening_to_spotify?: boolean;
  spotify?: { song: string; artist: string; album: string; album_art_url: string };
};
type DiscordStatus = {
  presence: Presence;
  username: string;
  avatar: string | null;
  activity: string;
};
type Settings = {
  // Visual theme, layout, and animation options controlled by the customizer.
  accent: string; cardColor: string; theme: ThemeMode; opacity: number; blur: number; rounding: number;
  glow: number; liquid: number; font: string; backgroundMode: 'gradient' | 'image' | 'video';
  background: string; backgroundDim: number; particles: boolean; tilt: boolean; typing: boolean;
  // Feature switches, layout choices, and profile values used by the page.
  visitor: boolean; alignment: 'center' | 'left'; width: 'wide' | 'compact'; preset: string;
  avatar: string; discordId: string; discordName: string;
  lastfm: string; links: Record<string, string>;
};

// Starting values for the page's appearance, profile details, and optional features.
const defaultSettings: Settings = {
  accent:'#43c5ff', cardColor:'#11192b', theme:'liquid', opacity:54, blur:20, rounding:24, glow:42, liquid:72,
  font:'Great Vibes', backgroundMode:'gradient', background:'', backgroundDim:36, particles:true,
  tilt:true, typing:true, visitor:true, alignment:'center', width:'wide', preset:'Liquid Blue',
  avatar:'', discordId:'', discordName:'',
  lastfm:'', links:{ Discord:'', TikTok:'', Instagram:'', 'Last.fm':'', GitHub:'', WhatsApp:'' },
};
// Identifies this app's saved customizer data in localStorage.
const settingsKey = 'brian-links-settings-v1';
// Accent swatches and mood presets provide quick alternatives to manual styling.
const colors = [
  { name:'Neon blue', value:'#43c5ff' }, { name:'Purple', value:'#a78bfa' },
  { name:'Pink', value:'#ff72ae' }, { name:'Red', value:'#ff5364' },
  { name:'Orange', value:'#ff963f' }, { name:'Green', value:'#5ee28d' },
  { name:'Cyan', value:'#44f1e2' }, { name:'White', value:'#f8fbff' },
];
// Named mood presets are partial overrides rendered as buttons in the customizer.
const presets: Record<string, Partial<Settings>> = {
  'Liquid Blue':{ accent:'#43c5ff',cardColor:'#11192b',theme:'liquid',opacity:54,blur:20,rounding:24,glow:42,liquid:72 },
  'Liquid Clear':{ accent:'#b5f3ff',theme:'liquid',opacity:32,blur:28,rounding:27,glow:26,liquid:90 },
  'Neon Blue':{ accent:'#5cbbff',theme:'outline',opacity:31,blur:15,rounding:20,glow:82,liquid:26 },
  Sunset:{ accent:'#ffad75',theme:'classic',opacity:61,blur:18,rounding:18,glow:43,liquid:50 },
  'Purple Haze':{ accent:'#b78cff',theme:'liquid',opacity:58,blur:25,rounding:26,glow:54,liquid:80 },
  'Matrix Green':{ accent:'#a6eb72',theme:'outline',opacity:37,blur:14,rounding:13,glow:63,liquid:25 },
};
// Keep each platform's icon, input hint, and URL base together.
const socials = [
  { name:'Discord', icon:SiDiscord, hint:'username or invite URL', platform:'https://discord.com' },
  { name:'TikTok', icon:SiTiktok, hint:'@username or profile URL', platform:'https://www.tiktok.com' },
  { name:'Instagram', icon:SiInstagram, hint:'@username or profile URL', platform:'https://www.instagram.com' },
  { name:'Last.fm', icon:SiLastdotfm, hint:'username or profile URL', platform:'https://www.last.fm' },
  { name:'GitHub', icon:SiGithub, hint:'username or profile URL', platform:'https://github.com' },
  { name:'WhatsApp', icon:SiWhatsapp, hint:'phone number or wa.me URL', platform:'https://wa.me' },
];
// The player UI and audio element both use this list as their source of truth.
const tracks = [
  { title:'Blue Hour, pt. 2', artist:'A quiet kind of loud', src:'/music/blue-hour.wav', length:18 },
  { title:'Soft Focus', artist:'Rooms with the lights down', src:'/music/soft-focus.wav', length:18 },
  { title:'After the Rain', artist:'Notes from Abuja', src:'public/music/Top 20 Best Songs Of JCole - JCole Greatest Hits Full ALbum 2021 - Best of JCole - Music Beat.mp3', length:50 },
];
// Reuse a single query cache for the API hooks used throughout the application.
const queryClient = new QueryClient();

// Load customizer values once at startup, filling in defaults for settings that
// may not exist in older saved data.
function readSavedSettings(): Settings {
  try {
    const saved = localStorage.getItem(settingsKey);
    if(!saved)return defaultSettings;
    const parsed=JSON.parse(saved) as Partial<Settings>;
    // Blob URLs belong to the current browser session, so restore the gradient
    // rather than keeping a video background that no longer exists after reload.
    if(typeof parsed.background==='string'&&parsed.background.startsWith('blob:')){
      parsed.background='';
      parsed.backgroundMode='gradient';
    }
    return { ...defaultSettings, ...parsed, links:{...defaultSettings.links,...parsed.links} };
  } catch { return defaultSettings; }
}
// Turn an entered social handle into a link, or keep it unchanged if it is
// already a URL. An empty value links to the platform's home page.
function profileHref(name:string, raw:string) {
  const value = raw.trim();
  if (!value) return socials.find(item=>item.name===name)?.platform ?? '#';
  // Accept complete URLs as-is, while turning the common handle/number formats
  // into profile links for visitors who enter only a username.
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  const clean=value.replace(/^@/,'');
  if (name==='WhatsApp') return `https://wa.me/${clean.replace(/\D/g,'')}`;
  if (name==='Discord') return `https://discord.com/users/${clean}`;
  const base = socials.find(item=>item.name===name)?.platform ?? '';
  return `${base}/${clean}`;
}
// Format the audio player's elapsed time as minutes and zero-padded seconds.
function formatTime(value:number) {
  const min=Math.floor(value/60), sec=Math.floor(value%60);
  return `${min}:${String(sec).padStart(2,'0')}`;
}
// Convert Last.fm's Unix timestamp into a short, readable relative time.
function formatPlayedAt(value:number|null) {
  if (!value) return 'Last played recently';
  const minutes=Math.max(0,Math.floor((Date.now()-value*1000)/60_000));
  if(minutes<1)return 'Last played just now';
  if(minutes<60)return `Last played ${minutes}m ago`;
  const hours=Math.floor(minutes/60);
  if(hours<24)return `Last played ${hours}h ago`;
  return `Last played ${Math.floor(hours/24)}d ago`;
}
// Convert a locally saved millisecond timestamp into a relative presence label.
function formatLastSeen(timestamp:number) {
  const minutes=Math.max(0,Math.floor((Date.now()-timestamp)/60_000));
  if(minutes<1)return 'Last seen just now';
  if(minutes<60)return `Last seen ${minutes}m ago`;
  const hours=Math.floor(minutes/60);
  if(hours<24)return `Last seen ${hours}h ago`;
  return `Last seen ${Math.floor(hours/24)}d ago`;
}

function Home() {
  // The main page owns user preferences, local-player state, animation state,
  // and the latest external presence response.
  const queryCache=useQueryClient();
  // Customizer visibility and the welcome overlay are separate from persisted settings.
  const [settings,setSettings]=useState<Settings>(readSavedSettings);
  const [customizerOpen,setCustomizerOpen]=useState(false);
  const [entered,setEntered]=useState(false);
  // Playback state drives both the HTML audio element and its visual controls.
  const [playing,setPlaying]=useState(false);
  const [trackIndex,setTrackIndex]=useState(0);
  const [progress,setProgress]=useState(0);
  const [duration,setDuration]=useState(0);
  const [typed,setTyped]=useState('');
  const [phraseIndex,setPhraseIndex]=useState(0);
  // Tilt stores both the card rotation and the highlight's pointer position.
  const [tilt,setTilt]=useState({x:0,y:0,lightX:50,lightY:24});
  // Keep the last Discord response separate from its loading/error state.
  const [discordStatus,setDiscordStatus]=useState<DiscordStatus|null>(null);
  const [discordState,setDiscordState]=useState<'unconfigured'|'loading'|'ready'|'error'>('unconfigured');
  const audioRef=useRef<HTMLAudioElement|null>(null);
  // File input refs let visible buttons trigger the browser's native picker.
  const backgroundFileRef=useRef<HTMLInputElement|null>(null);
  const videoFileRef=useRef<HTMLInputElement|null>(null);
  const avatarFileRef=useRef<HTMLInputElement|null>(null);
  // The same phrases are used for the animated and non-animated tagline.
  const typedPhrases=useMemo(()=>['web developer','people person','based in ABJ'],[]);
  const username=settings.lastfm.trim();
  // Fetch Last.fm only after a username is configured; refresh it every 30s.
  const lastfm=useGetLastFmRecentTrack({username:username||'brian'},{
    query:{queryKey:getGetLastFmRecentTrackQueryKey({username:username||'brian'}),enabled:Boolean(username),refetchInterval:30000,retry:1},
  });
  // Visitor count is loaded separately and updated after this tab records a visit.
  const visitors=useGetVisitorCount({query:{queryKey:getGetVisitorCountQueryKey(),retry:1}});
  const recordVisit=useRecordVisitorVisit();

  // Persist customizer changes. Temporary video URLs are omitted because they
  // stop working when the browser session ends.
  useEffect(()=>{
    try{
      const hasTemporaryVideo=settings.background.startsWith('blob:');
      const stored={...settings,background:hasTemporaryVideo?'':settings.background,backgroundMode:hasTemporaryVideo?'gradient':settings.backgroundMode};
      localStorage.setItem(settingsKey,JSON.stringify(stored));
    }catch{ /* Storage quota: settings remain available for this visit. */ }
  },[settings]);
  // Set document title and social-preview metadata when the page is mounted.
  useEffect(()=>{
    document.title='Brian — a little corner of the internet';
    const setMeta=(name:string,content:string,property=false)=>{
      const selector=property?`meta[property="${name}"]`:`meta[name="${name}"]`;
      let node=document.head.querySelector<HTMLMetaElement>(selector);
      if(!node){node=document.createElement('meta');if(property)node.setAttribute('property',name);else node.name=name;document.head.appendChild(node);}
      node.content=content;
    };
    setMeta('description','A little corner of the internet. Brian — web developer, people person, based in Abuja, Nigeria.');
    setMeta('og:title','Brian — a little corner of the internet',true);
    setMeta('og:description','The links, music, and small details that make this corner feel like mine.',true);
    setMeta('og:type','website',true);
    setMeta('twitter:card','summary');
  },[]);
  // Send one visit per browser tab and refresh the cached counter on success.
  useEffect(()=>{
    try {
      if(sessionStorage.getItem('brian-links-visited'))return;
      sessionStorage.setItem('brian-links-visited','1');
      recordVisit.mutate(undefined,{onSuccess:response=>queryCache.setQueryData(getGetVisitorCountQueryKey(),response)});
    } catch { /* The live counter remains readable if browser storage is disabled. */ }
  },[]);
  // Animate the short profile tagline, or show the current phrase immediately
  // when the typing animation is disabled.
  useEffect(()=>{
    if(!settings.typing){setTyped(typedPhrases[phraseIndex]);return;}
    const phrase=typedPhrases[phraseIndex];let timeout:number;
    if(typed.length<phrase.length)timeout=window.setTimeout(()=>setTyped(phrase.slice(0,typed.length+1)),82);
    else timeout=window.setTimeout(()=>{setTyped('');setPhraseIndex((phraseIndex+1)%typedPhrases.length);},1700);
    return()=>window.clearTimeout(timeout);
  },[typed,phraseIndex,settings.typing,typedPhrases]);
  // Load a newly selected audio source and keep playback going across track
  // changes if the player was already active.
  useEffect(()=>{
    const audio=audioRef.current;
    if(!audio)return;
    setProgress(0);
    setDuration(0);
    audio.load();
    if(playing)void audio.play().catch(()=>setPlaying(false));
  },[trackIndex]);
  // Poll Lanyard for Discord status; derive a readable activity line and retain
  // the last online time so an offline status can show when the user was seen.
  useEffect(()=>{
    const id=settings.discordId.trim();
    if(!id){setDiscordStatus(null);setDiscordState('unconfigured');return;}
    let active=true;
    const refreshDiscord=async()=>{
      try{
        const response=await fetch(`https://api.lanyard.rest/v1/users/${encodeURIComponent(id)}`,{signal:AbortSignal.timeout(8_000)});
        if(!response.ok)throw new Error('Lanyard request failed');
        const payload=await response.json() as {success?:boolean;data?:LanyardData};
        const data=payload.data;
        if(!payload.success||!data||!data.discord_user||!data.discord_status)throw new Error('Lanyard response was incomplete');
        if(!active)return;
        const user=data.discord_user;
        const avatar=user.avatar?`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=96`:null;
        let activity='Online now';
        if(data.listening_to_spotify&&data.spotify){
          activity=`Listening to ${data.spotify.song} by ${data.spotify.artist}`;
        }else{
          const game=data.activities?.find(item=>item.type===0&&item.name);
          if(game)activity=`Playing ${game.name}`;
          else if(data.discord_status==='offline'){
            const lastSeen=localStorage.getItem(`brian-links-last-online-${id}`);
            activity=lastSeen?formatLastSeen(Number(lastSeen)):'Offline right now';
          }
        }
        if(data.discord_status!=='offline'){
          try{localStorage.setItem(`brian-links-last-online-${id}`,String(Date.now()));}catch{ /* Presence still works without saved history. */ }
        }
        setDiscordStatus({
          presence:data.discord_status,
          username:user.global_name||user.username||settings.discordName||'Brian',
          avatar,
          activity,
        });
        setDiscordState('ready');
      }catch{
        if(active)setDiscordState('error');
      }
    };
    setDiscordState('loading');
    void refreshDiscord();
    const timer=window.setInterval(()=>void refreshDiscord(),15_000);
    return()=>{active=false;window.clearInterval(timer);};
  },[settings.discordId,settings.discordName]);

  // Merge a partial customizer change into the current settings without
  // discarding unrelated values.
  const update=(patch:Partial<Settings>)=>setSettings(current=>({...current,...patch}));
  // Toggle playback through the audio element; its events keep playing state in sync.
  const playAudio=()=>{
    const audio=audioRef.current;
    if(!audio)return;
    if(playing){audio.pause();return;}
    void audio.play().catch(()=>setPlaying(false));
  };
  // Wrap to the other end of the playlist when moving past its first or last item.
  const changeTrack=(step:number)=>{
    setTrackIndex(current=>(current+step+tracks.length)%tracks.length);
  };
  // Convert the pointer's position within the card into a bounded highlight
  // position and, when enabled, a small 3D rotation.
  const handleTilt=(event:PointerEvent<HTMLElement>)=>{
    const bounds=event.currentTarget.getBoundingClientRect();
    // Pointer percentages drive the card highlight; normalized values drive tilt.
    const lightX=Math.max(0,Math.min(100,((event.clientX-bounds.left)/bounds.width)*100));
    const lightY=Math.max(0,Math.min(100,((event.clientY-bounds.top)/bounds.height)*100));
    setTilt({x:settings.tilt?(lightY/100-.5)*-2:0,y:settings.tilt?(lightX/100-.5)*2:0,lightX,lightY});
  };
  const loadFile=(file:File|null,field:'avatar'|'background')=>{
    if(!file)return;
    // Read an uploaded image as a data URL so it can be displayed and persisted.
    // The size limit helps keep the encoded image within localStorage limits.
    if(file.size>2*1024*1024){window.alert('Please choose an image smaller than 2 MB so it can be saved on this device.');return;}
    const reader=new FileReader();reader.onload=()=>update({[field]:String(reader.result),...(field==='background'?{backgroundMode:'image' as const}:{})});reader.readAsDataURL(file);
  };
  // Apply the chosen mood's partial overrides while preserving other preferences.
  const choosePreset=(name:string)=>update({...presets[name],preset:name});
  // Provide a readable tooltip when a social profile has not been configured.
  const linkDisplay=(name:string)=>settings.links[name]||'add a link';

  // Derive display values and theme styles from state before building the page.
  const track=lastfm.data?.track;
  const displayCount=visitors.data?.count ?? (visitors.isLoading?'…':'—');
  const pageClasses=`site-shell theme-${settings.theme} ${settings.alignment==='left'?'alignment-left':''} ${settings.tilt?'':'no-tilt'} ${settings.width==='compact'?'compact-mode':''}`;
  // CSS custom properties pass the selected colors and numeric styling values
  // from React into the theme definitions in index.css.
  const shellStyle={
    '--accent-color':settings.accent,'--card-color':settings.cardColor,'--panel-opacity':`${settings.opacity}%`,'--panel-blur':`${settings.blur}px`,
    '--panel-radius':`${settings.rounding}px`,'--glow-intensity':settings.glow/100,'--liquid-intensity':settings.liquid/100,
    '--name-font':`'${settings.font}', cursive`,
  } as CSSProperties;
  // Select an uploaded image or the default gradient, and apply the chosen dim.
  const backgroundStyle:CSSProperties={
    opacity:1-settings.backgroundDim/100,
    ...(settings.backgroundMode==='image'&&settings.background?{backgroundImage:`url("${settings.background}")`}:{}),
    ...(settings.backgroundMode==='gradient'?{}:{backgroundColor:'#080b15'}),
  };
  const styleOptions=['liquid','classic','solid','outline','frosted'] as const;
  const styleNames:Record<ThemeMode,string>={liquid:'Liquid Glass',classic:'Classic Glass',solid:'Solid',outline:'Neon Outline',frosted:'Frosted White'};
  const discordPresence=discordStatus?.presence??'offline';
  const discordActivity=discordState==='unconfigured'
    ?'Add your Discord ID in the style panel.'
    :discordState==='loading'&&!discordStatus
      ?'Checking Discord presence…'
      :discordState==='error'
        ?'Discord presence is unavailable right now.'
        :discordStatus?.activity??'Offline right now.';
  const playerDuration=duration||tracks[trackIndex].length;

  return <div className={pageClasses} style={shellStyle}>
    {/* Background layers create the page atmosphere; particles are optional. */}
    <svg className="filter-defs" aria-hidden="true" focusable="false">
      <filter id="liquid-refract">
        <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="7" result="noise"/>
        <feDisplacementMap in="SourceGraphic" in2="noise" scale={settings.liquid*0.18} xChannelSelector="R" yChannelSelector="G"/>
      </filter>
    </svg>
    <div className="ambient-bg" style={backgroundStyle} />
    {settings.backgroundMode==='video'&&settings.background&&<video className="ambient-bg" src={settings.background} autoPlay muted loop playsInline style={{objectFit:'cover',opacity:1-settings.backgroundDim/100}} />}
    <div className="grain" />
    {settings.particles&&Array.from({length:22},(_,index)=><span key={index} className="particle" style={{left:`${(index*47+8)%100}%`,top:`${(index*67+3)%100}%`,animationDelay:`${index%8*-1.4}s`,animationDuration:`${13+index%9}s`}} />)}
    <div className={`page-wrap ${settings.width==='compact'?'compact':''}`}>
      <header className="topline entrance">
        <div className="top-mark">Brian’s corner</div>
        <div className="top-right"><span className="micro-pill">ABJ · NG</span><span className="micro-pill">01 / 01</span></div>
      </header>
      <main>
        <div className="main-stack">
          {/* Main identity card: portrait, tagline, Discord presence, and socials. */}
          <section
            className="glass hero-card entrance delay-1"
            onPointerMove={handleTilt}
            onPointerLeave={()=>setTilt({x:0,y:0,lightX:50,lightY:24})}
            style={{
              '--light-x':`${tilt.lightX}%`,
              '--light-y':`${tilt.lightY}%`,
              transform:settings.tilt?`perspective(1000px) rotateX(${tilt.x*1.7}deg) rotateY(${tilt.y*1.7}deg)`:undefined,
            } as CSSProperties}
          >
            <div className="eyebrow"><span className="live-dot" /> a little corner of the internet</div>
            <div className="avatar-wrap">
              {settings.avatar?<img src={settings.avatar} alt="Brian's profile portrait" data-testid="img-avatar" />:<div className="avatar-fallback" data-testid="img-avatar">B</div>}
              <button className="avatar-edit" aria-label="Replace avatar" data-testid="button-replace-avatar" onClick={()=>avatarFileRef.current?.click()}><Upload size={12}/></button>
              <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={event=>loadFile(event.target.files?.[0]??null,'avatar')} />
            </div>
            <h1 className="name-title" data-testid="text-brian-name">Brian</h1>
            <p className="location"><MapPin size={13}/> Abuja, Nigeria <span aria-hidden="true">·</span> WAT</p>
            <p className="tagline" data-testid="text-typing-line">{settings.typing?typed:typedPhrases[phraseIndex]}<span className="typing-caret" /></p>
            <section className="status-card inner-status">
              <div className="card-head">
                <span className="section-kicker">Discord presence</span>
                <span className={`status-badge ${discordPresence}`} data-testid="status-discord"><i />{discordPresence==='dnd'?'do not disturb':discordPresence}</span>
              </div>
              <div className="status-content">
                <div className="discord-avatar-wrap">
                  {discordStatus?.avatar?<img className="discord-avatar" src={discordStatus.avatar} alt="" data-testid="img-discord-avatar"/>:<div className="discord-avatar discord-avatar-fallback"><MessageCircle size={18}/></div>}
                  <span className={`discord-presence-dot ${discordPresence}`}/>
                </div>
                <div className="discord-copy">
                  <div className="status-name" data-testid="text-discord-username">{settings.discordName.trim()||discordStatus?.username||'Brian'}</div>
                  <div className="status-line" data-testid="text-discord-status">{discordActivity}</div>
                </div>
              </div>
            </section>
            <nav className="social-icons" aria-label="Social links">
              {socials.map(({name,icon:Icon})=><a
                key={name}
                className="social-icon-link"
                href={profileHref(name,settings.links[name]??'')}
                target="_blank"
                rel="noreferrer"
                aria-label={name}
                title={`${name} · ${linkDisplay(name)}`}
                data-testid={`link-social-${name.toLowerCase().replace('.','')}`}
              ><Icon size={18} aria-hidden="true"/></a>)}
            </nav>
            <div className="hero-bottom">
              {settings.visitor&&<span className="visitor" data-testid="text-visitor-count"><Eye size={13}/>{visitors.isError?'—':displayCount} visits</span>}
              <span>Here, in my own words</span>
            </div>
          </section>
          {/* Last.fm card shows loading/error states or the latest scrobble. */}
          <section className="glass track-card entrance delay-2">
            <div className="card-head"><span className="section-kicker">Last.fm · recent track</span><Music2 size={15} color="var(--accent-color)"/></div>
            {username&&lastfm.isLoading?<div className="track-fallback">Finding the last thing Brian listened to…</div>:
              username&&lastfm.isError?<div className="track-fallback" data-testid="text-lastfm-fallback">Last.fm isn’t available right now. Check back in a moment.</div>:
              username&&lastfm.data&&!lastfm.data.available?<div className="track-fallback" data-testid="text-lastfm-fallback">Last.fm couldn’t reach that profile. Check the username in the style panel.</div>:
              track?<div className="track-body">
                {track.image?<img className="album-art" src={track.image} alt={`${track.album} album artwork`} />:<div className="album-art album-placeholder"><Disc3 size={24}/></div>}
                <div><div className="track-title" data-testid="text-lastfm-track">{track.title}</div><div className="track-artist">{track.artist}</div><div className={`track-state ${track.nowPlaying?'is-live':''}`}>{track.nowPlaying?<><span className="track-live-dot"/>Listening now</>:formatPlayedAt(track.playedAt)}</div></div>
              </div>:<div className="track-fallback" data-testid="text-lastfm-fallback">{username?'No recent track to show yet.':'Add a Last.fm username in the style panel to show Brian’s recent track.'}</div>}
          </section>
          {/* Local player: track selection, seeking, playback controls, and audio. */}
          <section className="glass player-card entrance delay-3">
            <div className="player-top"><span className="section-kicker">A small listening room</span><span className="playing-label"><span className={`equalizer ${playing?'':'paused'}`}><span/><span/><span/><span/></span>{playing?'playing':'ready'}</span></div>
            <div className="player-song"><div className="player-art"><AudioLines size={18}/></div><div className="player-track-copy"><div className="song-title">{tracks[trackIndex].title}</div><div className="song-sub">{tracks[trackIndex].artist}</div></div><div className={`disc ${playing?'spin':''}`} /></div>
            <div className="seek-wrap"><input className="seek" type="range" min="0" max={playerDuration} step="0.1" value={Math.min(progress,playerDuration)} style={{'--progress':`${progress/playerDuration*100}%`} as CSSProperties} aria-label="Seek through the track" data-testid="input-player-seek" onChange={event=>{const value=Number(event.target.value);setProgress(value);if(audioRef.current)audioRef.current.currentTime=value;}}/><div className="time-row"><span>{formatTime(progress)}</span><span>{formatTime(playerDuration)}</span></div></div>
            <div className="player-controls">
              <button className="control-btn" aria-label="Previous track" data-testid="button-player-previous" onClick={()=>changeTrack(-1)}><SkipBack size={17}/></button>
              <button className="control-btn" aria-label="Rewind 10 seconds" data-testid="button-player-rewind" onClick={()=>{if(audioRef.current)audioRef.current.currentTime=Math.max(0,audioRef.current.currentTime-10);}}><SkipBack size={14}/></button>
              <button className="play-btn" aria-label={playing?'Pause audio':'Play audio'} data-testid="button-player-play" onClick={playAudio}>{playing?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button>
              <button className="control-btn" aria-label="Forward 10 seconds" data-testid="button-player-forward" onClick={()=>{if(audioRef.current)audioRef.current.currentTime=Math.min(playerDuration,audioRef.current.currentTime+10);}}><ChevronRight size={14}/></button>
              <button className="control-btn" aria-label="Next track" data-testid="button-player-next" onClick={()=>changeTrack(1)}><SkipForward size={17}/></button>
            </div>
            <audio
              ref={audioRef}
              src={tracks[trackIndex].src}
              preload="metadata"
              onLoadedMetadata={event=>setDuration(Number.isFinite(event.currentTarget.duration)?event.currentTarget.duration:tracks[trackIndex].length)}
              onTimeUpdate={event=>setProgress(event.currentTarget.currentTime)}
              onPlay={()=>setPlaying(true)}
              onPause={()=>setPlaying(false)}
              onEnded={()=>{setPlaying(true);changeTrack(1);}}
              onError={()=>setPlaying(false)}
            />
          </section>
        </div>
      </main>
      <footer className="footerline"><span>Made with a little bit of everywhere</span><span>Brian · Abuja, Nigeria</span></footer>
    </div>

    {/* Floating button opens the live customizer; its controls update page state. */}
    <button className="customizer-toggle" aria-label={customizerOpen?'Close style customizer':'Open style customizer'} data-testid="button-open-customizer" onClick={()=>setCustomizerOpen(open=>!open)}><Settings2 size={20}/></button>
    {customizerOpen&&<aside className="customizer-panel" aria-label="Live style customizer" data-testid="panel-style-customizer">
      <div className="customizer-head"><div><div className="customizer-title">Make it yours</div><div className="customizer-sub">Changes save on this device</div></div><button className="close-customizer" aria-label="Close customizer" data-testid="button-close-customizer" onClick={()=>setCustomizerOpen(false)}><X size={17}/></button></div>
      {/* Presets and surface controls change the card theme and visual styling. */}
      <div className="custom-section"><div className="custom-section-title">Start with a mood</div><div className="preset-grid">{Object.keys(presets).map(name=><button key={name} className="preset-button" data-testid={`button-preset-${name.toLowerCase().replaceAll(' ','-')}`} onClick={()=>choosePreset(name)}>{settings.preset===name?<Check size={11} style={{display:'inline',marginRight:5}}/>:null}{name}</button>)}</div></div>
      <div className="custom-section"><div className="custom-section-title">Surface</div><div className="mode-grid">{styleOptions.map(mode=><button key={mode} className={`mode-button ${settings.theme===mode?'active':''}`} data-testid={`button-theme-${mode}`} onClick={()=>update({theme:mode})}>{styleNames[mode]}</button>)}</div>
        <div className="custom-section-title" style={{marginTop:16}}>Accent · eight small sparks</div><div className="swatch-row">{colors.map(color=><button key={color.value} className={`swatch ${settings.accent===color.value?'active':''}`} style={{background:color.value}} title={color.name} aria-label={`Set accent ${color.name}`} data-testid={`button-accent-${color.name.toLowerCase().replace(' ','-')}`} onClick={()=>update({accent:color.value})}/>)}</div>
        <div className="custom-row"><label className="custom-label" htmlFor="accent-color">Custom accent</label><input id="accent-color" className="color-picker" type="color" value={settings.accent} data-testid="input-accent-color" onChange={event=>update({accent:event.target.value})}/></div>
        <div className="custom-row"><label className="custom-label" htmlFor="card-color">Card color</label><input id="card-color" className="color-picker" type="color" value={settings.cardColor} data-testid="input-card-color" onChange={event=>update({cardColor:event.target.value})}/></div>
        <Range label="Card opacity" value={settings.opacity} min={0} max={100} suffix="%" onChange={value=>update({opacity:value})}/>
        <Range label="Blur" value={settings.blur} min={0} max={30} suffix="px" onChange={value=>update({blur:value})}/>
        <Range label="Rounding" value={settings.rounding} min={0} max={40} suffix="px" onChange={value=>update({rounding:value})}/>
        <Range label="Glow" value={settings.glow} min={0} max={100} suffix="%" onChange={value=>update({glow:value})}/>
        <Range label="Liquid" value={settings.liquid} min={0} max={100} suffix="%" onChange={value=>update({liquid:value})}/>
        <div className="custom-row"><label className="custom-label" htmlFor="name-font">Name lettering</label><select id="name-font" className="custom-select" value={settings.font} data-testid="select-name-font" onChange={event=>update({font:event.target.value})}>{['Great Vibes','Playball','Pacifico','Orbitron','Poppins'].map(font=><option key={font} value={font}>{font}</option>)}</select></div>
      </div>
      {/* Space controls cover background media, layout, and optional effects. */}
      <div className="custom-section"><div className="custom-section-title">Your space</div>
        <div className="custom-row"><label className="custom-label" htmlFor="background-mode">Background</label><select id="background-mode" className="custom-select" value={settings.backgroundMode} data-testid="select-background-mode" onChange={event=>update({backgroundMode:event.target.value as Settings['backgroundMode']})}><option value="gradient">Gradient</option><option value="image">Image upload</option><option value="video">Video upload</option></select></div>
        <Range label="Background dim" value={settings.backgroundDim} min={0} max={85} suffix="%" onChange={value=>update({backgroundDim:value})}/>
        <label className="upload-btn"><Upload size={12} style={{display:'inline',marginRight:6}}/>Choose a background image<input ref={backgroundFileRef} type="file" accept="image/*" data-testid="input-background-image" onChange={event=>loadFile(event.target.files?.[0]??null,'background')}/></label>
        <label className="upload-btn"><Upload size={12} style={{display:'inline',marginRight:6}}/>Choose a background video<input ref={videoFileRef} type="file" accept="video/*" data-testid="input-background-video" onChange={event=>{const file=event.target.files?.[0];if(file){if(file.size>12*1024*1024){window.alert('Please choose a video smaller than 12 MB.');return;}update({background:URL.createObjectURL(file),backgroundMode:'video'});}}}/></label>
        {settings.background&&<button className="preset-button" style={{width:'100%',marginTop:7}} data-testid="button-clear-background" onClick={()=>update({background:'',backgroundMode:'gradient'})}><RotateCcw size={11} style={{display:'inline',marginRight:6}}/>Reset background</button>}
        <div className="custom-row"><span className="custom-label">Page width</span><select className="custom-select" value={settings.width} data-testid="select-page-width" onChange={event=>update({width:event.target.value as Settings['width']})}><option value="wide">Wide</option><option value="compact">Compact</option></select></div>
        <div className="custom-row"><span className="custom-label">Content alignment</span><select className="custom-select" value={settings.alignment} data-testid="select-alignment" onChange={event=>update({alignment:event.target.value as Settings['alignment']})}><option value="center">Center</option><option value="left">Left</option></select></div>
        <Toggle label="Drifting particles" checked={settings.particles} onChange={value=>update({particles:value})}/><Toggle label="Pointer tilt" checked={settings.tilt} onChange={value=>update({tilt:value})}/><Toggle label="Typing line" checked={settings.typing} onChange={value=>update({typing:value})}/><Toggle label="Visitor counter" checked={settings.visitor} onChange={value=>update({visitor:value})}/>
      </div>
      {/* Profile credentials and social URLs populate the live cards and links. */}
      <div className="custom-section"><div className="custom-section-title">Your details</div>
        <Field label="Discord ID" placeholder="Paste your Discord user ID" value={settings.discordId} testId="input-discord-id" onChange={value=>update({discordId:value})}/>
        <Field label="Discord display name" placeholder="brian" value={settings.discordName} testId="input-discord-name" onChange={value=>update({discordName:value})}/>
        <div className="custom-hint">Discord presence updates from Lanyard every 15 seconds.</div>
        <Field label="Last.fm username" placeholder="Your Last.fm username" value={settings.lastfm} testId="input-lastfm-username" onChange={value=>update({lastfm:value})}/>
        <div className="custom-section-title" style={{marginTop:17}}>Social links</div>
        {socials.map(item=><Field key={item.name} label={item.name} placeholder={item.hint} value={settings.links[item.name]??''} testId={`input-link-${item.name.toLowerCase().replace('.','')}`} onChange={value=>update({links:{...settings.links,[item.name]:value}})}/>)}
        <div className="custom-row" style={{marginTop:16}}><button className="preset-button" style={{width:'100%'}} data-testid="button-reset-settings" onClick={()=>{setSettings(defaultSettings);localStorage.removeItem(settingsKey);}}>Reset to Liquid Blue</button></div>
      </div>
    </aside>}
    {/* A user gesture dismisses the welcome overlay and starts audio, satisfying
        browsers that block autoplay until the visitor interacts with the page. */}
    <div className={`enter-overlay ${entered?'dismissed':''}`} aria-label="Enter Brian's page">
      <div className="enter-card"><div className="enter-mark"><AudioLines size={24}/></div><h2 className="enter-title">A moment for the music</h2><p className="enter-copy">Come in, take your time. A quiet little soundscape is waiting on the other side.</p><button className="enter-button" data-testid="button-enter-site" onClick={()=>{setEntered(true);if(!playing)playAudio();}}><Volume2 size={14}/> Tap to enter <ChevronRight size={14}/></button></div>
    </div>
  </div>;
}

// Reusable numeric slider used for appearance and background settings.
function Range({label,value,min,max,suffix,onChange}:{label:string;value:number;min:number;max:number;suffix:string;onChange:(value:number)=>void}) {
  return <div className="range-row"><label>{label}</label><input type="range" min={min} max={max} value={value} aria-label={label} data-testid={`range-${label.toLowerCase().replaceAll(' ','-')}`} onChange={event=>onChange(Number(event.target.value))}/><span className="range-value">{value}{suffix}</span></div>;
}
// Reusable checkbox control for enabling or disabling a page feature.
function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}) {
  return <label className="switch-row">{label}<input type="checkbox" checked={checked} data-testid={`toggle-${label.toLowerCase().replaceAll(' ','-')}`} onChange={event=>onChange(event.target.checked)}/></label>;
}
// Reusable labeled text field for customizer values such as names and URLs.
function Field({label,placeholder,value,testId,onChange}:{label:string;placeholder:string;value:string;testId:string;onChange:(value:string)=>void}) {
  return <label className="custom-label" style={{display:'block',marginTop:11}}>{label}<input className="custom-input" type="text" placeholder={placeholder} value={value} data-testid={testId} onChange={event=>onChange(event.target.value)}/></label>;
}
// Route the home page and send every unmatched path to the not-found page.
function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home}/><Route component={NotFound}/></Switch></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({children}:{children:ReactNode}) {
  const [location]=useLocation();
  // Reset the boundary on navigation so an old route error does not persist.
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  // Compose app-wide data fetching, routing, tooltips, error handling, and toasts.
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><Router/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
