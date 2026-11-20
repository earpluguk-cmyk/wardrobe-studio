/* My Wardrobe — compact weather and clothing briefing.
   Weather data © Open-Meteo (CC BY 4.0). This module does not access wardrobe records.
   Location coordinates are used only to request the forecast and are not stored. */
(function(){
'use strict';
const node=id=>document.getElementById(id);
const CITY_STORAGE='wardrobe-weather-town-v1';
const FORECAST_URL='https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL='https://geocoding-api.open-meteo.com/v1/search';
let busy=false,activePlace=null,lastLoaded=0,usedGps=false,started=false;
function fail(source,error){
  try { if(typeof logWardrobeError==='function') logWardrobeError('Weather '+source,error); }
  catch(e) { console.warn('Weather issue',source); }
}
function status(text,failed=false){
 const message=node('weatherStatus');
 if(message){message.textContent=text;message.classList.toggle('weather-error',failed);}
 const line=node('weatherProgressLine');if(line)line.hidden=!busy&&!text;
}
function setBusy(value,description){
 busy=value;
 const spinner=node('weatherSpinner');
 if(spinner)spinner.hidden=!value;
 const refresh=node('weatherRefresh');
 if(refresh)refresh.disabled=value;
 const gps=node('weatherUseLocation');
 if(gps)gps.disabled=value;
 const find=node('weatherTownSubmit');
 if(find)find.disabled=value;
 if(value)status(description||'Checking the forecast…');
 else {const line=node('weatherProgressLine');const message=node('weatherStatus');if(line)line.hidden=!(message&&message.textContent);}
}
function showLocationOptions(show){
 const el=node('weatherLocationOptions');
 if(el)el.hidden=!show;
}
function formatHour(h){const n=((h%24)+24)%24;return (n%12||12)+(n>=12?' pm':' am');}
function hourRange(start,end){
 const a=start.slice(11,13)*1,b=end.slice(11,13)*1;
 const am=a<12?'am':'pm',bm=b<12?'am':'pm';
 return (a%12||12)+(am===bm?'':' '+am)+'–'+(b%12||12)+' '+bm;
}
function describeCode(code){
 if(code>=95)return 'Thunderstorms';
 if((code>=71&&code<=77||code===85||code===86))return 'Snowy';
 if(code>=51&&code<=67)return 'Rainy';
 if(code>=80&&code<=82)return 'Showery';
 if(code===45||code===48)return 'Foggy';
 if(code===0)return 'Clear skies';
 if(code===1||code===2)return 'Partly cloudy';
 return 'Cloudy';
}
// SVG outlines keep the icons neutral on iPhone, where emoji often render in colour.
const weatherSvgPaths={
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
 cloud:'<path d="M20 16.6A4.5 4.5 0 0 0 17.5 8a6 6 0 0 0-11.3 2A4 4 0 0 0 6 18h12a3 3 0 0 0 2-1.4Z"/>',
 'cloud-sun':'<path d="M12 3a3.5 3.5 0 0 0-3.4 4.4M4 6l-1-1M2 11h2m9-7 1-2M20 17a4 4 0 0 0-3.5-6 5 5 0 0 0-9.8 1A3.5 3.5 0 0 0 7 19h10a3.5 3.5 0 0 0 3-2Z"/>',
 rain:'<path d="M20 15a4.5 4.5 0 0 0-3.5-7 6 6 0 0 0-11 2.8A4 4 0 0 0 6 18h10"/><path d="m9 20-1 2m5-3-1 2m5-2-1 2"/>',
 snow:'<path d="M12 2v20M4 6l16 12M20 6 4 18m5-13 3 3 3-3m-6 14 3-3 3 3M3 11l3 1-1 3m16-4-3 1 1 3"/>',
 storm:'<path d="M19 14a5 5 0 0 0-4-8 6 6 0 0 0-11 5 4 4 0 0 0 1 7h5"/><path d="m14 13-3 5h4l-3 4"/>',
 umbrella:'<path d="M3 12a9 9 0 0 1 18 0H3Z"/><path d="M12 12v7a2 2 0 0 0 4 0"/>',
 thermometer:'<path d="M14 14.8V5a3 3 0 0 0-6 0v9.8a5 5 0 1 0 6 0Z"/><path d="M11 11v8"/>'
};
function weatherSvg(key){
 const path=weatherSvgPaths[key]||weatherSvgPaths.cloud;
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
}
function weatherSymbol(code){
 if(code===0)return 'sun';
 if(code===1||code===2)return 'cloud-sun';
 if((code>=71&&code<=77||code===85||code===86))return 'snow';
 if(code>=51&&code<=67||code>=80&&code<=82)return 'rain';
 if(code>=95)return 'storm';
 return 'cloud';
}
function rainHour(hour){
 return (Number(hour.rain)||0)>=0.25||(Number(hour.pop)||0)>=60||[51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(hour.code);
}
function weatherBrief(data){
 const cur=data.current,hourly=data.hourly;
 if(!cur||!hourly||!Array.isArray(hourly.time)||!hourly.time.length)throw Error('Incomplete hourly weather forecast');
 const temp=Number(cur.temperature_2m),feel=Number(cur.apparent_temperature),wind=Number(cur.wind_speed_10m);
 if(!Number.isFinite(temp)||!Number.isFinite(feel))throw Error('Invalid current temperature data');
 const now=String(cur.time||hourly.time[0]);
 const currentHour=now.slice(0,13);
 const today=now.slice(0,10);
 const parts=hourly.time.map((time,i)=>({
    time, temp:Number(hourly.temperature_2m?.[i]),
    feel:Number(hourly.apparent_temperature?.[i]),pop:Number(hourly.precipitation_probability?.[i])||0,
    rain:Number(hourly.precipitation?.[i])||0,
    wind:Number(hourly.wind_speed_10m?.[i])||0,
    gust:Number(hourly.wind_gusts_10m?.[i])||0,
    code:Number(hourly.weather_code?.[i])
 })).filter(h=>h.time.slice(0,13)>=currentHour).slice(0,14);
 // Keep the remainder of today when possible, including later showers.
 const todayParts=parts.filter(h=>h.time.slice(0,10)===today);
 const forecast=(todayParts.length>=3?todayParts:parts.slice(0,9));
 const rainHours=forecast.filter(rainHour);
 const firstRain=rainHours[0];
 let rainStart=null,rainEnd=null,rainLabel='No rain expected',rainLine='Dry for most of the day',anyRain=!!firstRain;
 const significant=rainHours.some(h=>h.rain>=1.5||h.pop>=80||[63,65,81,82,95,96,99].includes(h.code));
 const snow=forecast.some(h=>(h.code>=71&&h.code<=77||h.code===85||h.code===86));
 if(anyRain){
   rainStart=firstRain.time;
   const idx=forecast.indexOf(firstRain);
   let j=idx;
   while(j+1<forecast.length&&rainHour(forecast[j+1])&&j-idx<7)j++;
   const start=forecast[idx].time,finish=forecast[j].time;
   // End time is the hour after the last rainy period.
   const endTime=finish.slice(0,11)+String((Number(finish.slice(11,13))+1)%24).padStart(2,'0')+':00';
   const nowRain=idx===0&&rainHour(forecast[0]);
   if(rainHours.length>=Math.max(6,Math.floor(forecast.length*.7))){
     rainLabel='Much of the day';
     rainLine=significant?'Rain through much of the day':'Showers on and off today';
   }else{
     rainLabel=nowRain?'Now · '+hourRange(start,endTime):hourRange(start,endTime);
     const h=Number(start.slice(11,13)),when=start.slice(0,10)!==today?'overnight':h<12?'this morning':h<17?'this afternoon':'this evening';
     rainLine=(significant?'Rain expected ':'Showers expected ')+when;
   }
 }
 const peakGust=Math.max(wind,...forecast.map(h=>Number.isFinite(h.gust)?h.gust:0));
 const peakWind=Math.max(wind,...forecast.map(h=>Number.isFinite(h.wind)?h.wind:0));
 const veryWindy=peakGust>=55||peakWind>=35;
 const windy=peakGust>=35||peakWind>=23;
 const avgFeel=forecast.map(h=>h.feel).filter(Number.isFinite);
 const minFeel=avgFeel.length?Math.min(...avgFeel):feel;
 const cooling=minFeel<feel-4;
 const coolLabel=feel<=5?'Cold outside':feel<12?'Chilly outside':feel<18?'Mild outside':feel<24?'Quite warm outside':'Warm outside';
 const windLabel=veryWindy?'Quite windy at times':windy?'Breezy at times':peakWind>9?'Light breeze':'Mostly calm';
 const notes=[coolLabel,windLabel,snow?'Possible snow or sleet':rainLine];
 let title,detail;
 const outfitFeel=Math.min(feel,minFeel+2);
 if(outfitFeel<=3){title='Wrap up warm today.';detail='A warm jumper and winter coat are a good choice. Add a scarf if you’ll be outdoors for a while.';}
 else if(outfitFeel<=8){title='Jumper and a proper coat today.';detail='It’s cold enough for a warm outer layer, especially if you’re spending time outside.';}
 else if(outfitFeel<=12){title='A jumper and jacket make sense.';detail='A T-shirt underneath gives you an easy layer if you warm up indoors.';}
 else if(outfitFeel<=17){title='T-shirt and jumper should do.';detail='Keep a light jacket handy if you’re heading out for longer.';}
 else if(outfitFeel<=21){title='T-shirt with a light layer.';detail='A jumper is worth taking if you’re staying out into the evening.';}
 else if(outfitFeel<=26){title='Definitely T-shirt weather.';detail='Shorts could work if you’re comfortable; a light layer is enough later.';}
 else {title='T-shirt and shorts weather.';detail='Keep it light and remember sun protection if you’ll be out for a while.';}
 if(snow){title='Go for warm, weatherproof layers.';detail='Wear a warm coat and closed shoes; take extra care if paths become slippery.';}
 else if(anyRain){
   if(significant){
      detail=feel>=19?'It’s fairly warm, but take a waterproof jacket and closed shoes for the rain.':'Take a waterproof jacket and closed shoes, especially if you’re out when the rain arrives.';
      if(feel>=20)title='T-shirt weather, but plan for rain.';
   }else{
      detail=feel>=20?'It’s mild enough for a T-shirt. Take a light waterproof jacket if you’re out later.':'Take a light waterproof jacket if you’re heading out later.';
   }
 }
 if(veryWindy&&anyRain){
   detail='A waterproof jacket is more useful than an umbrella in the wind. '+(feel<11?'Keep your warm layer on.':'Keep a layer handy.');
 }else if(veryWindy&&!anyRain){
   detail=feel<11?'The wind will make it feel cooler, so take a proper coat.':'It may feel breezier than it looks, so keep a light jacket handy.';
 }else if(cooling&&!anyRain&&feel>=16){
   detail='It’s comfortable now, but it will cool down later. Take a jumper or light jacket.';
 }
 const cond=describeCode(Number(cur.weather_code)||0);
 return {temperature:Math.round(temp),feels:Math.round(feel),condition:cond,icon:weatherSymbol(Number(cur.weather_code)||0),
   observations:notes,title,detail,rainLabel,precipType:snow?'Snow possible':'Rain expected',updated:Date.now()};
}
function renderBrief(result,label){
 node('weatherLocationLabel').textContent=label||'Your location';
 node('weatherTemp').textContent=result.temperature+'°C';
 node('weatherFeels').textContent=result.condition;
 node('weatherIcon').innerHTML=weatherSvg(result.icon);
 node('weatherCondition').textContent=result.condition;
 const list=node('weatherObservations');
 list.replaceChildren();
 result.observations.forEach((note,i)=>{
  const li=document.createElement('li');
  const bullet=document.createElement('span');bullet.className='weather-observation-dot';bullet.textContent=i===2?'◦':'✓';
  const words=document.createElement('span');words.textContent=note;
  li.append(bullet,words);list.appendChild(li);
 });
 node('weatherWearTitle').textContent=result.title;
 node('weatherWearDetail').textContent=result.detail;
 node('weatherRain').textContent=result.rainLabel;
 node('weatherPrecipLabel').textContent=result.precipType;
 node('weatherPrecipIcon').innerHTML=weatherSvg(result.precipType==='Snow possible'?'snow':'umbrella');
 node('weatherFeelsTile').textContent=result.feels+'°C';
 node('weatherUpdated').textContent='Updated '+new Date(result.updated).toLocaleTimeString('en-GB',{hour:'numeric',minute:'2-digit'});
 node('weatherReady').hidden=false;
 node('weatherEmpty').hidden=true;
 status('');
 lastLoaded=Date.now();
}
function fetchJSON(url,timeout=11000){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);
 return fetch(url,{signal:c.signal,cache:'no-store'}).then(response=>{
   if(!response.ok)throw Error('Weather service returned '+response.status);
   return response.json();
 }).finally(()=>clearTimeout(timer));
}
async function fetchForecast(place){
 const u=new URL(FORECAST_URL);
 u.searchParams.set('latitude',String(Number(place.latitude).toFixed(3)));
 u.searchParams.set('longitude',String(Number(place.longitude).toFixed(3)));
 u.searchParams.set('timezone','auto');
 u.searchParams.set('forecast_days','2');
 u.searchParams.set('current','temperature_2m,apparent_temperature,wind_speed_10m,weather_code');
 u.searchParams.set('hourly','temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m');
 return fetchJSON(u.toString());
}
async function loadPlace(place,isGPS){
 if(busy)return;
 setBusy(true,'Checking today’s forecast…');
 try{
  const raw=await fetchForecast(place);
  const briefing=weatherBrief(raw);
  activePlace=place;usedGps=!!isGPS;
  renderBrief(briefing,place.label||'Your location');
  showLocationOptions(false);
 }catch(err){
  fail('forecast',err);
  if(!lastLoaded){node('weatherReady').hidden=true;node('weatherEmpty').hidden=false;}
  status('Couldn’t load a reliable forecast. Try again or choose a town.',true);
  showLocationOptions(true);
 }finally{setBusy(false);}
}
function geoPosition(){
 return new Promise((resolve,reject)=>{
   if(!navigator.geolocation){reject(Error('Location is not supported by this browser'));return;}
   navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:12000,maximumAge:15*60*1000});
 });
}
async function useWardrobeLocation(){
 if(busy)return;
 setBusy(true,'Checking your phone’s location…');
 try{
  const position=await geoPosition();
  const coords=position.coords;
  if(!Number.isFinite(coords.latitude)||!Number.isFinite(coords.longitude))throw Error('Location unavailable');
  try{localStorage.removeItem(CITY_STORAGE)}catch(e){}
  // Release the loading state before making the separate forecast request.
  setBusy(false);
  await loadPlace({latitude:coords.latitude,longitude:coords.longitude,label:'Current location'},true);
 }catch(err){
  fail('location',err);
  status('Location isn’t available. Enter a town instead, or try again.',true);
  showLocationOptions(true);
  node('weatherEmpty').hidden=false;
 }finally{setBusy(false)}
}
async function chooseWardrobeTown(event){
 if(event)event.preventDefault();
 if(busy)return;
 const name=node('weatherTownInput').value.trim();
 if(name.length<2){status('Please enter a town or city.',true);return;}
 setBusy(true,'Finding '+name+'…');
 try{
   const u=new URL(GEOCODE_URL);
   u.searchParams.set('name',name);
   u.searchParams.set('count','5');
   u.searchParams.set('language','en');
   u.searchParams.set('format','json');
   const found=await fetchJSON(u.toString());
   const places=Array.isArray(found.results)?found.results:[];
   if(!places.length)throw Error('No matching location. Try a nearby town');
   const q=name.toLowerCase();
   const exact=places.filter(p=>p.name?.toLowerCase()===q);
   const selected=(exact.find(p=>p.country_code==='GB')||exact[0]||places[0]);
   const place={latitude:selected.latitude,longitude:selected.longitude,label:selected.name+(selected.country_code==='GB'?'':', '+(selected.country||''))};
   if(!Number.isFinite(place.latitude)||!Number.isFinite(place.longitude))throw Error('Invalid town location');
   // Only save the chosen town, never precise GPS coordinates.
   try{localStorage.setItem(CITY_STORAGE,JSON.stringify(place))}catch(e){}
   setBusy(false);
   await loadPlace(place,false);
 }catch(err){
   fail('town',err);
   status('Couldn’t find that location. Try a nearby town or city.',true);
   showLocationOptions(true);
 }finally{setBusy(false)}
}
function changeWardrobeWeatherLocation(){showLocationOptions(node('weatherLocationOptions').hidden);}
async function refreshWardrobeWeather(){
 if(busy)return;
 if(usedGps||!activePlace){await useWardrobeLocation();return;}
 await loadPlace(activePlace,false);
}
function startWardrobeWeather(){
 if(started||!node('weatherCard'))return;
 started=true;
 node('weatherEmpty').hidden=false;
 node('weatherReady').hidden=true;
 let saved=null;
 try{saved=JSON.parse(localStorage.getItem(CITY_STORAGE)||'null');}catch(e){}
 if(saved&&Number.isFinite(saved.latitude)&&Number.isFinite(saved.longitude)){
   loadPlace(saved,false);return;
 }
 // Ask once via the browser's own location permission; a refusal never blocks the wardrobe.
 useWardrobeLocation();
 document.addEventListener('visibilitychange',()=>{
   if(document.visibilityState==='visible'&&lastLoaded&&Date.now()-lastLoaded>75*60*1000&&navigator.onLine!==false)refreshWardrobeWeather();
 });
}
window.useWardrobeLocation=useWardrobeLocation;
window.chooseWardrobeTown=chooseWardrobeTown;
window.changeWardrobeWeatherLocation=changeWardrobeWeatherLocation;
window.refreshWardrobeWeather=refreshWardrobeWeather;
window.startWardrobeWeather=startWardrobeWeather;
// Pure logic exposed for smoke tests, not dependent on any wardrobe data.
window.wardrobeWeatherBrief=weatherBrief;
})();