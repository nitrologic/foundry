// foundry.js
// a research client for evaluating models
// (c)2025 Simon Armstrong

// linter is on, constification continues
// avoid raw ansi in function code

// binaries are available on github
//
// https://github.com/nitrologic/foundry/releases
//
// or install deno and run from source 
// 
// https://deno.com/
//
// deno run --allow-run --allow-env --allow-net --allow-read --allow-write roha.js

import { contentType } from "https://deno.land/std@0.224.0/media_types/mod.ts";
import { resolve } from "https://deno.land/std/path/mod.ts";
import OpenAI from "https://deno.land/x/openai@v4.67.2/mod.ts";

const terminalColumns=120;
const slowMillis = 25;

const foundryVersion = "rc2";
const rohaTitle="foundry "+foundryVersion;
const rohaMihi="I am testing foundry client. You are a helpful assistant.";
const cleanupRequired="Switch model, drop shares or reset history to continue.";
const pageBreak="#+# #+#+# #+#+# #+#+# #+#+# #+#+# #+#+# #+#+# #+#+# #+# #+#+# #+#+# #+#+# #+#+# #+# #+#+# #+#";

const mut="Model Under Test";

// main roha application starts here

const SpentTokenChar="¤";
const MaxFileSize=65536;

const appDir = Deno.cwd();
const rohaPath = resolve(appDir,"foundry.json");
const accountsPath = resolve(appDir,"accounts.json");
const ratesPath=resolve(appDir,"modelrates.json");
const forgePath=resolve(appDir,"forge");

const modelAccounts = JSON.parse(await Deno.readTextFile(accountsPath));
const modelRates = JSON.parse(await Deno.readTextFile(ratesPath));

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

const flagNames={
	commitonstart : "commit shared files on start",
	saveonexit : " save conversation history on exit",
	ansi : "markdown ANSI rendering",
	slow : "output at reading speed",
	verbose : "emit debug information",
	broken : "ansi background blocks",
	logging : "log all output to file",
	debugging : "temporary switch for emitting debug information",
	pushonshare : "emit a /push after any /share",
	forge : "enable model tool interface",
	rawPrompt : "experimental rawmode stdin deno prompt replacement",
	disorder : "allow /dos command to run shell",
	resetcounters : "factory reset when reset",
	versioning : "allow multiple versions in share history",
	returntopush : "hit return to /push - under test"
};

const emptyRoha={
	config:{
		showWelcome:false,
		commitonstart:true,
		saveonexit:false,
		ansi:true,
		slow:false,
		verbose:true,
		broken:false,
		logging:false,
		resetcounters:false,
		returntopush:false
	},
	tags:{},
	band:{},
	sharedFiles:[],
	saves:[],
	counters:{},
	mut:{},
	lode:{},
	forge:[]
};

function cleanup(){
	Deno.stdin.setRaw(false);
}

async function exitFoundry(){
	echo("exitFoundry");
	await flush();
	if(roha.config.saveonexit){
		await saveHistory();
	}
	await flush();
	cleanup();
}

function price(credit){
	if (credit === null || isNaN(credit)) return "$0";
	return "$"+credit.toFixed(4);
}

function addBand(){
	const id="member"+increment("members");
	roha.band[id]={};
}

function listBand(){
	const band=[];
	for(let id in roha.band){
		const member=roha.band[id];
		band.push(member);
	}
	band.push("add");
	for(let i=0;i<band.length;i++){
		echo(i,band[i]);
	}
	memberList=band;
}

function annotateTag(name,description){
	if(!name){
		throw("null name");
	}
	if(!(name in roha.tags)) {
		roha.tags[name]={};
//		throw("tag not found "+name);
	}
	roha.tags[name].description=description;
}

function annotateShare(name,description){
	let index=roha.sharedFiles.findIndex(item => item.id === name);
	if(index==-1) {
		throw("annotateShare name not found "+name);
	}
	roha.sharedFiles[index].description=description;
	echo("annotateShare annotated file share",name);
}

function increment(key){
	let i=0;
	if(key in roha.counters){
		i=roha.counters[key]+1;
	}
	roha.counters[key]=i;
	return i
}

let modelList=[];
let lodeList=[];

// never read - work in progress

let tagList=[];
let shareList=[];
let memberList=[];

const emptyMUT = {
	notes:[],errors:[]
}

const emptyModel={
	name:"empty",account:"",hidden:false,prompts:0,completion:0
}

const emptyTag={
}

// const emptyShare={path,size,modified,hash,tag,id}

let roha=emptyRoha;
let rohaCalls=0;
let listCommand="";
let creditCommand=null;
let rohaShares=[];
let currentDir = Deno.cwd();
let rohaHistory;

var sessionStack=[];

function pushHistory(){
	sessionStack.push(rohaHistory);
	resetHistory();
}
function popHistory(){
	if(sessionStack.length==0) return false;
	return sessionStack.pop();
}
function resetHistory(){
	rohaHistory = [{role:"system",content:rohaMihi}];
}

function listHistory(){
	let history=rohaHistory;
	for(let i=0;i<history.length;i++){
		let item=history[i];
		let content=readable(item.content).substring(0,90)
		echo(i,item.role,item.name||"foundry","-",content);
	}
	if(roha.config.broken){
		let flat=squashMessages(rohaHistory);
		for(let i=0;i<flat.length;i++){
			let item=flat[i];
			let content=readable(item.content).substring(0,90);
			echo("flat",i,item.role,item.name||"broken",content);
		}
	}
}

function rohaPush(content,name="foundry"){
	rohaHistory.push({role:"user",name,content});
}

resetHistory();

// roaTools

const rohaTools = [{
	type: "function",
	function:{
		name: "read_time",
		description: "Returns current time in UTC",
		parameters: {
			type: "object",
			properties: {},
			required: []
		}
	}
},{
	type: "function",
	function:{
		name: "submit_file",
		description: "Submit a file for review",
		parameters: {
			type: "object",
			properties: {
				contentType:{type:"string"},
				content:{type:"string"}
			},
			required: ["contentType","content"]
		}
	}
},{
	type: "function",
	function: {
		name: "annotate_forge",
		description: "Set description of any object",
		parameters: {
			type: "object",
			properties: {
				name: { type: "string" },
				type: { type:"string" },
				description: { type: "string" }
			},
			required: ["name","type","description"]
		}
	}
}];

async function sleep(ms) {
	await new Promise(function(resolve) {setTimeout(resolve, ms);});
}

function unitString(value,precision=2,type){
	if (typeof value !== 'number' || isNaN(value)) return "NaN";
	const units=["","K","M","G","T"];
	const abs=Math.abs(value);
	const unit=(Math.log10(abs)/3)|0;
	if(roha.config.debugging) echo("unitString unit:",unit);
	if(unit>0){
		if(unit>4)unit=4;
		let n = value / Math.pow(10, unit*3);
		let digits = Math.max(1, String(Math.floor(n)).length);
		n = n.toFixed(Math.max(0, precision - digits));
		return n+units[unit]+type;
	}
	return String(value)+type;
}
function measure(o){
	let value=(typeof o==="string")?o.length:JSON.stringify(o).length;
	return unitString(value,4,"B");
}

let outputBuffer = [];
let printBuffer = [];

function print(){
	let args=arguments.length?Array.from(arguments):[];
	let lines=args.join(" ").split("\n");
	for(let line of lines){
		printBuffer.push(line.trimEnd());
	}
}

function echo(){
	let args=arguments.length?Array.from(arguments):[];
	let lines=args.join(" ").split("\n");
	for(let line of lines){
		outputBuffer.push(line.trimEnd());
	}
}

function debug(title,value){
	print(title);
	if(roha.config.verbose){
		let json=JSON.stringify(value);
		echo(json);
	}
}

async function log(lines,id){
	if(roha.config.logging){
		const time = new Date().toISOString();
		let list=[];
		for(let line of lines.split("\n")){
			line=stripAnsi(line);
			line=time+" ["+id+"] "+line+"\n";
			list.push(line);
		}
		await Deno.writeTextFile("foundry.log",list.join(),{append:true});
	}
}

async function flush() {
	const delay = roha.config.slow ? slowMillis : 0;
	for (const line of printBuffer) {
		console.log(line);
		log(line,"model");
		await sleep(delay)
	}
	printBuffer=[];
	for (const line of outputBuffer) {
		console.log(line);
		log(line,"stdout");
		await sleep(delay);
	}
	outputBuffer=[];
}

function wordWrap(text,cols=terminalColumns){
	let result=[];
	let pos=0;
	while(pos<text.length){
		let line=text.substring(pos,pos+cols);
		let n=line.length;
		if(n==cols){
			let i=line.lastIndexOf(" ",n);
			if(i>0){
				line=line.substring(0,i);
				n=i+1;
			}
		}
		result.push(line);
		pos+=n;
	}
	return result.join("\n");
}

function safeStringify(value, seen = new WeakSet(), keyName = "") {
	if (typeof value === "string") return value;
	if (value === null || typeof value !== "object") return String(value);
	if (typeof value === "function") return "[function]";
	if (seen.has(value)) return keyName ? `[circular (${keyName})]` :"[circular]";
	seen.add(value);
	if (Array.isArray(value)) {
		const items = value.map((item, index) => stringify(item, seen,
		String(index)));
		return `[${items.join(",\n")}]`;
	}
	const entries = Object.entries(value).map(([key, val]) => `${key}: ${stringify(val, seen, key)}`);
	return `{${entries.join(",\n")}}`;
}

async function connectAccount(account) {
	let verbose=false;//roha.config.verbose;
	echo("Connecting to account:", account);
	const config = modelAccounts[account];
	if (!config) return null;
	try{
		const apiKey = Deno.env.get(config.env);
		const endpoint = new OpenAI({ apiKey, baseURL: config.url });
		if(verbose){
			for(const [key, value] of Object.entries(endpoint)){
				let content=safeStringify(value);
				echo("endpoint:"+key+":"+content);
			}
		}
		const models = await endpoint.models.list();
		const list=[];
		for (const model of models.data) {
			let name=model.id+"@"+account;
			list.push(name);
// dont do this	if(verbose) echo("model - ",JSON.stringify(model,null,"\t"));
			await specModel(model,account);
		}
		list.sort();
		modelList=modelList.concat(list);
		return endpoint;
	}catch(error){
	// Error: 429 "Your team ac0a3c9a-0e58-4e3c-badd-be853c027a7f has either used all available credits or
	// reached its monthly spending limit. To continue making API requests, please purchase more credits or
	// raise your spending limit."
		echo(error);
	}
	return null;
}

async function specAccount(account){
	const config = modelAccounts[account];
	const endpoint = rohaEndpoint[account];
	if(!(account in roha.lode)){
		roha.lode[account] = {name: account,url: endpoint.baseURL,env: config.env,credit: 0};
	}
}

async function specModel(model,account){
	let name=model.id+"@"+account;
	let exists=name in roha.mut;
	let info=exists?roha.mut[name]:{name,notes:[],errors:[],relays:0,cost:0};
	info.id=model.id;
	info.object=model.object;
	info.created=model.created;
	info.owner=model.owned_by;
//	echo("statModel",name,JSON.stringify(model));
	if (!info.notes) info.notes = [];
	if (!info.errors) info.errors = [];
	roha.mut[name]=info;
}

async function resetModel(name){
	grokModel=name;
	grokFunctions=true;
	rohaHistory.push({role:"system",content:"Model changed to "+name+"."});
	let rate=(name in modelRates)?modelRates[name].pricing||[0,0]:[0,0];
	echo("model:",name,"tool",grokFunctions,"rates",rate[0].toFixed(2)+","+rate[1].toFixed(2));
	await writeFoundry();
}

function dropShares(){
	let dirty=false;
	for(const item of rohaHistory){
		if(item.role==="user" && item.name==="forge"){
			item.user="foundry";
			item.content="dropped share";
			dirty=true;
		}
	}
	if(dirty)echo("content removed from history");
	if(rohaShares.length){
		rohaShares=[];
		echo("all shares dropped");
	}
	if(roha.config.commitShares) echo("With commitShares enabled consider /reset.")
}

function listShare(){
	const list=[];
	let count=0;
	let sorted = roha.sharedFiles.slice();
	sorted.sort((a, b) => b.size - a.size);
	for (const share of sorted) {
		let shared=(rohaShares.includes(share.path))?"*":"";
		let tags="["+share.tag+"]";
		let info=(share.description)?share.description:"";
		echo((count++),share.path,share.size,shared,tags,info);
		list.push(share.id);
	}
	shareList=list;
}

function listSaves(){
	let saves=roha.saves||[];
	for(let i=0;i<saves.length;i++){
		echo(i,saves[i]);
	}
}

async function saveHistory(name) {
	try {
		let timestamp=Math.floor(Date.now()/1000).toString(16);
		let filename=(name||"transmission-"+timestamp)+".json";
		let filePath = resolve(forgePath,filename);
		let line="Saved session "+filename+".";
		rohaHistory.push({role:"system",content:line});
		await Deno.writeTextFile(filePath,JSON.stringify(rohaHistory,null,"\t"));
		echo(line);
		roha.saves.push(filename);
		await writeFoundry();
	} catch (error) {
		console.error("Error saving history:", error.message);
	}
}

async function loadHistory(filename){
	let history;
	try {
		const fileContent = await Deno.readTextFile(filename);
		history = JSON.parse(fileContent);
		echo("History restored from "+filename);
	} catch (error) {
		console.error("Error restoring history:", error.message);
		echo("console error");
		history=[{role:"system",content: "You are a helpful assistant."}];
	}
	return history;
}


function stripAnsi(text) {
	return text.replace(/\x1B\[\d+(;\d+)*[mK]/g, "");
}

// Array of 8 ANSI colors (codes 30-37) selected for contrast and visibility in both light and dark modes.
const ansiColors = [
	"\x1b[30m", // Black: Deep black (#333333), subtle on light, visible on dark
	"\x1b[31m", // Red: Muted red (#CC3333), clear on white and black
	"\x1b[32m", // Green: Forest green (#2D6A4F), good contrast on both
	"\x1b[33m", // Yellow: Golden yellow (#DAA520), readable on dark and light
	"\x1b[34m", // Blue: Medium blue (#3366CC), balanced visibility
	"\x1b[35m", // Magenta: Soft magenta (#AA3377), distinct on any background
	"\x1b[36m", // Cyan: Teal cyan (#008080), contrasts well without glare
	"\x1b[37m"  // White: Light gray (#CCCCCC), subtle on light, clear on dark
];

function ansiStyle(text, style = "bold", colorIndex = null) {
	if (!roha.config.ansi) return text;
	let formatted = text;
	switch (style.toLowerCase()) {
		case "bold": formatted = "\x1b[1m" + formatted + "\x1b[0m"; break;
		case "italic": formatted = "\x1b[3m" + formatted + "\x1b[0m"; break;
		case "underline": formatted = "\x1b[4m" + formatted + "\x1b[0m"; break;
	}
	if (colorIndex !== null && colorIndex >= 0 && colorIndex < ansiColors.length) {
		formatted = ansiColors[colorIndex] + formatted + "\x1b[0m";
	}
	return formatted;
}

const ansiWhite = "\x1b[38;5;255m";
const ansiNeonPink = "\x1b[38;5;201m";
const ansiVividOrange = "\x1b[38;5;208m";

const ansiGreenBG = "\x1b[48;5;23m";
const ansiTealBG = "\x1b[48;5;24m";
const ansiGreyBG = "\x1b[48;5;232m";
const ansiReset = "\x1b[0m";

const ansiCodeTitle = ansiTealBG+ansiVividOrange;
const ansiCodeBlock = ansiGreenBG+ansiWhite;

const ansiReplyBlock = ansiGreyBG;

const ansiPop = "\x1b[1;36m";



const ansiMoveToEnd = "\x1b[999B";
const ansiSaveCursor = "\x1b[s";
const ansiRestoreCursor = "\x1b[u";

const rohaPrompt=">";
let colorCycle=0;

function mdToAnsi(md) {
	let verbose=roha.config.verbose;
	let broken=roha.config.broken;
	const lines = md.split("\n");
	let inCode = false;
	const result = broken?[ansiReplyBlock]:[];
	for (let line of lines) {
		line=line.trimEnd();
		const trim=line.trim();
		if (trim.startsWith("```")) {
			inCode = !inCode;
			if(inCode){
				const codeType=trim.substring(3).trim();
//				result.push(ansiCodeTitle)
//				result.push("====                   [   ]");
				result.push(ansiCodeBlock);
				if(roha.config.debugging&&codeType) print("inCode codetype:",codeType,"line:",line);
			}else{
				result.push(ansiReset);
				if (broken) result.push(ansiReplyBlock);
			}
		}else{
			if (!inCode) {
				// rules
				if(line.startsWith("---")||line.startsWith("***")||line.startsWith("___")){
					line=pageBreak;
				}
				// headershow
				const header = line.match(/^#+/);
				if (header) {
					const level = header[0].length;
					line = line.substring(level).trim();
					const ink=ansiColors[(colorCycle++)&7];
					line = ink + line + ansiReset;	//ansiPop
				}
				// bullets
				if (line.startsWith("*") || line.startsWith("+")) {
					line = "• " + line.substring(1).trim();
				}
				// bold
				if (line.includes("**")) {
					line = line.replace(/\*\*(.*?)\*\*/g, "\x1b[1m$1\x1b[0m");
				}
				// italic
				line = line.replace(/\*(.*?)\*/g, "\x1b[3m$1\x1b[0m");
				line = line.replace(/_(.*?)_/g, "\x1b[3m$1\x1b[0m");
				// wordwrap
				line=wordWrap(line,terminalColumns);
			}
			result.push(line.trimEnd());
		}
	}
	result.push(ansiReset);
	return result.join("\n");
}

async function hashFile(filePath) {
	const buffer = await Deno.readFile(filePath);
	const hash = await crypto.subtle.digest("SHA-256", buffer);
	const bytes = new Uint8Array(hash);
	return Array.from(bytes, (byte) => 
		byte.toString(16).padStart(2, "0")
	).join("");
}

async function readFoundry(){
	try {
		const fileContent = await Deno.readTextFile(rohaPath);
		roha = JSON.parse(fileContent);
		if(!roha.saves) roha.saves=[];
		if(!roha.counters) roha.counters={};
		if(!roha.band) roha.band={};
		if(!roha.mut) roha.mut={};
		if(!roha.forge) roha.forge=[];
		if(!roha.lode) roha.lode={};
	} catch (error) {
		console.error("Error reading or parsing",rohaPath,error);
		roha=emptyRoha;
	}
}

async function writeFoundry(){
	try {
		roha.model=grokModel;
		await Deno.writeTextFile(rohaPath, JSON.stringify(roha, null, "\t"));
	} catch (error) {
		console.error("Error writing",rohaPath,error);
	}
}

async function resetRoha(){
	rohaShares = [];
	roha.sharedFiles=[];
//	roha.tags={};
	if(roha.config.resetcounters) roha.counters={};
	increment("resets");
	await writeFoundry();
	resetHistory();
	echo("resetRoha","All shares and history reset.");
}

function resolvePath(dir,filename){
	let path=resolve(dir,filename);
	path = path.replace(/\\/g, "/");
	return path;
}

// multi process model under test prompt replacement

async function pipe(stream, tag) {
	const raw = new Uint8Array(1024);
	let buffer="";
	while (true) {
		const n = await stream.read(raw);
		if (n === null) break;
		buffer+=decoder.decode(raw.subarray(0,n));
		echo("[" + tag + "]",buffer.trimEnd());
		buffer="";
		await flush();
	}
}

async function runDOS(args) {
	if(!roha.config.disorder) return;
	const shell = Deno.build.os === "windows" ? "cmd" : "bash";
	const cmd = [shell, ...args.slice(1)];
	echo("runDos",Deno.build.os,shell,"Type exit to return to Foundry.");
	await flush();
	const oldRaw = Deno.stdin.isRaw;
	Deno.stdin.setRaw(false);
	const p = Deno.run({cmd,stdin: "inherit",stdout: "inherit",stderr: "inherit"});
	await p.status();
	p.close();
	Deno.stdin.setRaw(oldRaw);
	echo("Returned to Foundry");
}

async function runDeno(path, cwd) {
	try {
		const r = `--allow-read=${cwd}`;
		const w = `--allow-write=${cwd}`;
		const cmd = ["deno", "run", "--no-remote", r, w, path];
		const p = Deno.run({ cmd, stdout: "piped", stderr: "piped" });
		const a = pipe(p.stdout, "out");
		const b = pipe(p.stderr, "err");
		const c = p.status();
		await Promise.all([a, b, c]);
		p.close();
		return { ok: true, content: "done" };
	} catch (e) {
		return { ok: false, error: e.message };
	}
}

// dream on gpt-4.1...
async function spawnDeno(path, cwd) {
	try{
		const cmd = ["deno", "run", "--no-remote", `--allow-read=${cwd}`, `--allow-write=${cwd}`, path];
		const proc = await Deno.spawn(cmd, { stdout: "piped", stderr: "piped" });
		const a = pipe(proc.stdout, "out");
		const b = pipe(proc.stderr, "err");
		const c = proc.status;
		await Promise.all([a, b, c]);
		proc.stdout.close();
		proc.stderr.close();
		proc.close();
		return {ok:true,content:"done"};
	}catch(error){
		return {ok:false,error};
	}
}

async function runCode(){
	let result = await runDeno("isolation/test.js", "isolation");
	if (result.ok) {
		echo("[isolation] runCode ran result:"+result.content);
	} else {
		echo("Error:", result.error);
	}
}

// a raw mode prompt replacement
// roha.config.rawPrompt is not default
// arrow navigation and tab completion incoming
// a reminder to enable rawPrompt for new modes

const reader = Deno.stdin.readable.getReader();
const writer = Deno.stdout.writable.getWriter();

let promptBuffer = new Uint8Array(0);

async function promptFoundry(message) {
	if(!roha.config.rawPrompt) return prompt(message);
	let result = "";
	if (message) {
		await writer.write(encoder.encode(message));
		await writer.ready;
	}
	Deno.stdin.setRaw(true);
	try {
		let busy = true;
		while (busy) {
			const { value, done } = await reader.read();
			if (done || !value) break;
			let bytes = [];
			for (const byte of value) {
				if (byte === 0x7F || byte === 0x08) { // Backspace
					if (promptBuffer.length > 0) {
						promptBuffer = promptBuffer.slice(0, -1);
						bytes.push(0x08, 0x20, 0x08);
					}
				} else if (byte === 0x1b) { // Escape sequence
					if (value.length === 1) {
						await exitFoundry();
						Deno.exit(0);
					}
					if (value.length === 3) {
						if (value[1] === 0xf4 && value[2] === 0x50) {
							echo("F1");
						}
					}
					break;
				} else if (byte === 0x0A || byte === 0x0D) { // Enter key
					bytes.push(0x0D, 0x0A);
					let line = decoder.decode(promptBuffer);
					let n = line.length;
					if (n > 0) {
						promptBuffer = promptBuffer.slice(n);
					}
					result = line.trimEnd();
					log(result, "stdin");
					busy = false;
				} else {
					bytes.push(byte);
					const buf = new Uint8Array(promptBuffer.length + 1);
					buf.set(promptBuffer);
					buf[promptBuffer.length] = byte;
					promptBuffer = buf;
				}
			}
			if (bytes.length) await writer.write(new Uint8Array(bytes));
		}
	} finally {
		Deno.stdin.setRaw(false);
	}
	return result;
}

// a work in progess file watcher
// callers to addShare expected to await writeFoundry after

const eventList=[];

async function watchPaths(paths,handler){
	const watcher = Deno.watchFs(paths,{recursive:false});
	for await (const event of watcher) {
		eventList.push(event);
	}
}

async function fileLength(path) {
	const info = await Deno.stat(path);
	return info.size;
}

async function addShare(share){
	share.id="share"+increment("shares");
	roha.sharedFiles.push(share);
	if(share.tag) {
		await setTag(share.tag,share.id);
	}
}

async function shareDir(dir, tag) {
	try {
		const paths = [];
		for await (const file of Deno.readDir(dir)) {
			if (file.isFile && !file.name.startsWith(".")) {
				paths.push(resolvePath(dir, file.name));
			}
		}
		for (const path of paths) {
			try {
				echo("Sharing",path);
				const info = await Deno.stat(path);
				const size = info.size||0;
				const modified = info.mtime.getTime();
				const hash = await hashFile(path);
				await addShare({ path, size, modified, hash, tag });
			} catch (error) {
				echo("shareDir path",path,error.message);
				continue;
			}
		}
		await writeFoundry();
		echo("Shared",paths.length,"files from",dir,"with tag",tag);
	} catch (error) {
		echo("shareDir error",String(error)); //.message
		throw error;
	}
}

function fileType(extension){
	return contentType(extension) || "application/octet-stream";
}

const textExtensions = [
	"js", "ts", "txt", "json", "md",
	"css","html", "svg",
	"cpp", "c", "h", "cs",
	"sh", "bat",
	"log","py","csv","xml","ini"
];

async function shareFile(path,tag) {
	let fileContent=null;
	try {
		const fileSize=fileLength(path);
		if(fileSize>MaxFileSize) throw(filesize);
		fileContent = await Deno.readFile(path);
	} catch (error) {
		echo("shareFile failure path",path,"error",error);
		return;
	}
	if(path.endsWith("rules.txt")){
		let lines=decoder.decode(fileContent).split("\n");
		for(let line of lines ){
			if (line) rohaHistory.push({role:"system",content: line});
		}
	}else{
		const length=fileContent.length;
		if(length>0 && length<MaxFileSize){
			const extension = path.split(".").pop();
			const type = fileType(extension);
			if (textExtensions.includes(extension)) {
				let txt = decoder.decode(fileContent);
				if(txt.length){
					let metadata=JSON.stringify({path,length,type,tag});
					rohaPush(metadata);
					rohaPush(txt,"forge");
				}
			}else{
				const base64Encoded = btoa(String.fromCharCode(...new Uint8Array(fileContent)));
				const mimeType = fileType(extension);
				let metadata=JSON.stringify({path,length,type,mimeType,tag});
				rohaPush(metadata);
				let binary=`File content: MIME=${mimeType}, Base64=${base64Encoded}`;
				rohaPush(binary,"forge");
			}
		}
	}
//	if(roha.config.verbose)echo("roha shared file " + path);
	if (!rohaShares.includes(path)) rohaShares.push(path);

	if (roha.config.pushonshare) {
		await commitShares(tag);
	}
}

async function shareBlob(path,size,tag){
	const extension = path.split(".").pop();
	const type = fileType(extension);
	const metadata = JSON.stringify({ path: path, length: size, type, tag });
	rohaPush(metadata);
	if (textExtensions.includes(extension)) {
		const content = await Deno.readTextFile(path);
		rohaPush(content,"forge");
	} else {
		const file = await Deno.open(path,{read:true});
		if (!file.readable) {
			throw new Error("Invalid file: readable stream required");
		}
		if (!mimeType) {
			throw new Error("MIME type required");
		}
		const chunks = [];
		const reader = file.readable.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}
			const buffer = await new Blob(chunks).arrayBuffer();
			const bytes = new Uint8Array(buffer);
			const base64Encoded = btoa(String.fromCharCode(...bytes));
			rohaPush(`File content: MIME=${mimeType}, Base64=${base64Encoded}`, "forge");
		} catch (error) {
			throw new Error(`Failed to encode file: ${error.message}`);
		} finally {
			reader.releaseLock();
			file.close();
		}
	}		
}

async function commitShares(tag) {
	let count = 0;
	let dirty = false;
	const validShares = [];
	const removedPaths = [];
	for (const share of roha.sharedFiles) {
		if (tag && share.tag !== tag) {
			validShares.push(share);
			continue;
		}
		try {
			const path=share.path;
			const info = await Deno.stat(path);
			const size=info.size;
			if (!info.isFile || size > MaxFileSize) {
				removedPaths.push(share.path);
				dirty = true;
				continue;
			}
			const modified = share.modified !== info.mtime.getTime();
			const isShared = rohaShares.includes(share.path);
			if (modified || !isShared) {
				shareBlob(path,size,tag);
				count++;
				share.modified = info.mtime.getTime();
				dirty = true;
				if (!rohaShares.includes(path)) rohaShares.push(path);
			}
			validShares.push(share);
		} catch (error) {
			if (error instanceof Deno.errors.NotFound || error instanceof Deno.errors.PermissionDenied) {
				removedPaths.push(share.path);
				dirty = true;
			}
			echo("commitShares path", share.path,"error", error.message);
		}
	}
	if (removedPaths.length) {
		roha.sharedFiles = validShares;
		await writeFoundry();
		echo("Removed invalid shares:", removedPaths.join(" "));
	}
	if (dirty && tag) {
		rohaHistory.push({ role: "system", content: "Feel free to call annotate_forge to tag " + tag });
	}
	if (count && roha.config.verbose) {
		echo("Updated files",count,"of",validShares.length);
	}
	return dirty;
}

async function setTag(name,note){
	const tags=roha.tags||{};
	const tag=(tags[name])?tags[name]:{name,info:[]};
	tag.info.push(note);
	tags[name]=tag;
	roha.tags=tags;
	await writeFoundry();
//	let invoke=`New tag "${name}" added. Describe all shares with this tag.`;
//	rohaHistory.push({role:"system",content:invoke});
}
function listCounters(){
	let keys=Object.keys(roha.counters);
	let i=0;
	for(let key of keys){
		let count=roha.counters[key];
		echo((i++),key,count);
	}
}
function listTags(){
	let tags=roha.tags||{};
	let keys=Object.keys(tags);
	let list=[];
	for(let i=0;i<keys.length;i++){
		let tag=tags[keys[i]];
		const name=tag.name||"?????";
		echo(i,name,"("+tag.info.length+")");
		let info=tag.description;
		if(info) echo("",info);
		list.push(name);
	}
	tagList=list;
}

async function openWithDefaultApp(path) {
	const cmd = Deno.build.os === "windows" ? ["start", "", path] : Deno.build.os === "darwin" ? ["open", path] : ["xdg-open", path];
	await Deno.run({ cmd }).status();
}

function onForge(args){
	let list=roha.forge;
	if(args.length>1){
		let name=args.slice(1).join(" ");
		if(name.length && !isNaN(name)) {
			let item=list[name|0];
			echo("opening",item.name,"from",item.path);
			openWithDefaultApp(item.path);
		}
	}else{
		for(let i=0;i<list.length;i++){
			echo(i,list[i].name);
		}
		listCommand="forge";
	}
}

async function creditAccount(credit,account){
	const amount=Number(credit);
	const lode=roha.lode[account];
	const current=lode.credit||0;
	lode.credit=amount;
	if(roha.config.verbose) {
		const delta=(current-amount).toFixed(2);
		echo("creditAccount",price(amount),account,"balance",price(lode.credit),"delta",delta);
	}
	await writeFoundry();
}

async function onAccount(args){
	if(args.length>1){
		let name=args.slice(1).join(" ");
		if(name.length && !isNaN(name)) {
			name=lodeList[name|0];
		}
		await specAccount(name);
		let lode=roha.lode[name];
		echo("Adjust",lode.name,"balance",price(lode.credit));
		creditCommand=(credit) => creditAccount(credit, name);
	}else{
		let list=[];
		for(let key in modelAccounts){
			list.push(key);
		}
		for(let i=0;i<list.length;i++){
			let key=list[i];
			if(key in roha.lode){
				let lode=roha.lode[key];
				echo(i,key,price(lode.credit));
			}else{
				echo(i,key);
			}
			lodeList=list;
			listCommand="credit";
		}
	}
}

async function showHelp() {
	try {
		const md = await Deno.readTextFile("foundry.md");
		echo(mdToAnsi(md));
	} catch (e) {
		echo("showHelp error",e.message);
	}
}

function readable(text){
	text=text.replace(/\s+/g, " ");
	return text;
}

async function callCommand(command) {
	let dirty=false;
	let words = command.split(" ");
	try {
		switch (words[0]) {
			case "dos":
				await runDOS(words);
				break;
			case "forge":
				onForge(words);
				break;
			case "band":
				listBand();
				break;
			case "counter":
				listCounters();
				break;
			case "tag":
				await listTags();
				break;
			case "credit":
				await onAccount(words);
				break;
			case "help":
				await showHelp();
				break;
			case "config":
				if(words.length>1){
					let flag=words[1].trim();
					if(flag.length && !isNaN(flag)){
						flag=Object.keys(flagNames)[flag|0];
						echo("flag",flag);
					}
					if(flag in flagNames){
						roha.config[flag]=!roha.config[flag];
						echo(flag+" - "+flagNames[flag]+" is "+(roha.config[flag]?"true":"false"));
						await writeFoundry();
					}
				}else{
					let count=0;
					for(let flag in flagNames){
						echo((count++),flag,":",flagNames[flag],":",(roha.config[flag]?"true":"false"))
					}
					listCommand="config";
				}
				break;
			case "time":
				echo("Current time:", new Date().toString());
				break;
			case "history":
				listHistory();
				break;
			case "load":{
					const save=words[1];
					if(save){
						if(save.length && !isNaN(save)) save=roha.saves[save|0];
						if(roha.saves.includes(save)){
							const history=await loadHistory(save);
							rohaHistory=history;
							echo("a new history is set");
						}
					}else{
						listSaves();
					}
				}
				break;
			case "save":{
					const savename=words.slice(1).join(" ");
					await saveHistory(savename);
				}
				break;
			case "note":
				if(grokModel in roha.mut){
					const mut=roha.mut[grokModel];
					const note=words.slice(1).join(" ");
					if(note.length){
						mut.notes.push(note);
						await writeFoundry();
					}else{
						const n=mut.notes.length;
						for(let i=0;i<n;i++){
							echo(i,mut.notes[i]);
						}
					}
				}
				break;
			case "model":
				let name=words[1];
				if(name){
					if(name.length&&!isNaN(name)) name=modelList[name|0];
					if(modelList.includes(name)){
						resetModel(name);
					}
				}else{
					for(let i=0;i<modelList.length;i++){
						let name=modelList[i];
						let attr=(name==grokModel)?"*":" ";
						let mut=(name in roha.mut)?roha.mut[name]:emptyMUT;
						let flag = (mut.hasForge) ? "𝆑" : "";
						let notes=mut.notes.join(" ");
						echo(i,attr,name,flag,mut.relays|0,notes);
					}
					listCommand="model";
				}
				break;
			case "run":
				await pushHistory();
				break;
			case "exit":
				let ok=await popHistory();
				if(!ok){
					echo("trigger exit here");
				}
				break;
			case "reset":
				await resetRoha();
				break;
			case "cd":
				if(words.length>1){
					const newDir = words[1];
					if (newDir.length) Deno.chdir(newDir);
				}
				currentDir = Deno.cwd();
				echo("Changed directory to", currentDir);
				break;
			case "dir":{
					const cwd=words.slice(1).join(" ")||currentDir;
					echo("Directory",cwd);
					const dirs=[];
					const files=[];
					for await (const file of Deno.readDir(cwd)) {
						const name=file.name;
						if(file.isDirectory)dirs.push(name);else files.push(name);
					}					
					if(dirs) echo("dirs",dirs.join(" "));
					if(files) echo("files",files.join(" "));
				}
				break;
			case "drop":
				dropShares();
				await writeFoundry();
				break;
			case "share":
				if (words.length==1){
					listShare();
				}else{
					const filename = words.slice(1).join(" ");
					const path = resolvePath(Deno.cwd(), filename);
					const info = await Deno.stat(path);
					const tag = "";//await promptFoundry("Enter tag name (optional):");
					if(info.isDirectory){
						echo("Share directory path:",path);
						await shareDir(path,tag);
					}else{
						const size=info.size;
						const modified=info.mtime.getTime();
						echo("Share file path:",path," size:",info.size," ");
						const hash = await hashFile(path,size);
						echo("hash:",hash);
						await addShare({path,size,modified,hash,tag});
					}
					await writeFoundry();
				}
				break;
			case "push":
			case "commit":
				let tag="";
				if(words.length>1){
					tag=words[1];
				}
				dirty=await commitShares(tag);
				break;
			default:
				echo("Command not recognised",words[0]);
				return false; // Command not recognized
		}
	} catch (error) {
		echo("callCommand error", error.message);
	}
	increment("calls");
	return dirty;
}

async function pathExists(path) {
	try {
		const stat = await Deno.stat(path);
		if (!stat.isFile) return false;
		return true;
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) return false;
		if (error instanceof Deno.errors.PermissionDenied) return false;
		throw error;
	}
}

function extensionForType(contentType) {
	if (contentType.includes("html")) return ".html";
	if (contentType.includes("markdown")) return ".md";
	if (contentType.includes("json")) return ".json";
	if (contentType.includes("javascript")) return ".js";
	if (contentType.includes("typescript")) return ".ts";
	return ".txt";
}

async function onCall(toolCall) {
	let verbose=roha.config.verbose;
	let name=toolCall.function.name;
	switch(name) {
		case "read_time":
			return {time: new Date().toISOString()};
		case "submit_file":
			let args=JSON.parse(toolCall.function.arguments);
			echo(args.contentType);
			if (verbose) echo(args.content);
			let timestamp=Math.floor(Date.now()/1000).toString(16);
			let extension=extensionForType(args.contentType)
			let name= "submission-"+timestamp+extension;
			let filePath = resolve(forgePath,name);
			await Deno.writeTextFile(filePath, args.content);
			echo("File saved to:", filePath);
			roha.forge.push({name,path:filePath,contentType});
			return { success: true, path: filePath };
		case "annotate_forge":
			try {
				const { name, type, description } = JSON.parse(toolCall.function.arguments || "{}");
				switch(type){
					case "tag":
						annotateTag(name,description);
						break;
					case "share":
						annotateShare(name,description);
						break;
				}
				await writeFoundry(); // Persist changes
				return { success: true, updated: 1 };
			} catch (error) {
				echo("annotate_forge error:",error);
			}
			return { success: false, updated: 0 };
			break;
		default:
			echo("onCall unhandled function name:",name);
			debug("toolCall",toolCall);
			return { success: false, updated: 0 };
		}
}

function squashMessages(history) {
	if (history.length < 2) return history;
	const squashed = [history[0]];
	let system=[];
	let other=[];
	for(let item of history){
		if(item.role=="system") system.push(item); else other.push(item);
	}
	for(let list of [system,other]){
		let last=null;
		for (let i = 0; i < list.length; i++) {
			const current=list[i];
			if(last){
				last.content += "\n" + current.content;
			} else {
				squashed.push(current);
				last=current;
			}
		}
	}
	return squashed;
}

async function isolateCode(path,cwd) {
	try {
		const readAllow = `--allow-read=${cwd}`;
		const writeAllow = `--allow-write=${cwd}`;
		const cmd = ["deno", "run", "--no-remote", readAllow, writeAllow, path];
		const process = Deno.run({ cmd, stdout: "piped", stderr: "piped" });
		const [stdout, stderr] = await Promise.all([process.output(), process.stderrOutput()]);
		const status = await process.status();
		process.close();
		return {
			success: status.success,
			output: new TextDecoder().decode(stdout),
			error: new TextDecoder().decode(stderr)
		};
	} catch (err) {
		return { success: false, output: "", error: err.message };
	}
}

async function processToolCalls(calls) {
	const results = [];
	for (const tool of calls) {
		if (!tool.id || !tool.function?.name) {
			results.push({
				tool_call_id: tool.id || "unknown",
				name: tool.function?.name || "unknown",
				content: JSON.stringify({error: "Invalid tool call format"})
			});
			await log(`Invalid tool call: ${JSON.stringify(tool)}`, "error");
			continue;
		}
		try {
			const result = await onCall(tool);
			results.push({
				tool_call_id: tool.id,
				name: tool.function.name,
				content: JSON.stringify(result || {success: false})
			});
		} catch (e) {
			results.push({
				tool_call_id: tool.id,
				name: tool.function.name,
				content: JSON.stringify({error: e.message})
			});
			await log(`Tool call failed: ${tool.function.name} - ${e.message}`, "error");
		}
	}
	return results;
}

async function relay() {
	const verbose=roha.config.verbose;
	try {
		const modelAccount=grokModel.split("@");
		let model=modelAccount[0];
		let account=modelAccount[1];
		let endpoint=rohaEndpoint[account];
		let usetools=grokFunctions&&roha.config.forge;
		const now=performance.now();
		const payload = usetools?{ model, messages:rohaHistory, tools: rohaTools }:{ model, messages:squashMessages(rohaHistory) };
		const completion = await endpoint.chat.completions.create(payload);
		const elapsed=(performance.now()-now)/1000;
		if (completion.model != model) {
			echo("[relay model alert model:" + completion.model + " grokModel:" + grokModel + "]");
			grokModel=completion.model+"@"+account;
		}
		if (verbose) {
			// echo("relay completion:" + JSON.stringify(completion, null, "\t"));
		}
		let system = completion.system_fingerprint;
		let usage = completion.usage;
		let size = measure(rohaHistory);
		let spent=[usage.prompt_tokens | 0,usage.completion_tokens | 0];
		grokUsage += spent[0]+spent[1];
		let spend=0;
		if(grokModel in roha.mut){
			let mut=roha.mut[grokModel];
			mut.relays = (mut.relays || 0) + 1;
			mut.elapsed = (mut.elapsed || 0) + elapsed;
			if(grokModel in modelRates){
				let rate=modelRates[grokModel].pricing||[0,0];
				spend=spent[0]*rate[0]/1e6+spent[1]*rate[1]/1e6;
				mut.cost+=spend;
				let lode = roha.lode[account];
				if(lode && typeof lode.credit === "number") {
					lode.credit-=spend;
					if (roha.config.verbose) {
						let summary=`account ${account} spent $${spend.toFixed(4)} balance $${(lode.credit).toFixed(4)} ${SpentTokenChar}[${spent[0]},${spent[1]}]`;
						echo(summary);
					}
				}
				await writeFoundry();
			}else{
				if(roha.config.verbose){
					echo("modelRates not found for",grokModel);
				}
			}
			mut.prompt_tokens=(mut.prompt_tokens|0)+spent[0];
			mut.completion_tokens=(mut.completion_tokens|0)+spent[1];
			if(usetools && mut.hasForge!==true){
				mut.hasForge=true;
				await writeFoundry();
			}
		}

		let cost="("+usage.prompt_tokens+"+"+usage.completion_tokens+"["+grokUsage+"])";
		if(spend) cost="$"+spend.toFixed(3);
		let modelSpec=[grokModel,cost,size,elapsed.toFixed(2)+"s"];
		let status = "["+modelSpec.join(" ")+"]";
		echo(status);
		var reply = "<blank>";
		for (const choice of completion.choices) {
			let calls = choice.message.tool_calls;
			// choice has index message{role,content,refusal,annotations} finish_reason
			if (calls) {
				increment("calls");
				debug("relay calls in progress",calls)
				// Generate tool_calls with simple, unique IDs
				const toolCalls = calls.map((tool, index) => ({
					id: tool.id,
					type: "function",
					function: {
						name: tool.function.name,
						arguments: tool.function.arguments || "{}"
					}
				}));
				// Add assistant message with tool_calls
				let content=choice.message.content || "";
				rohaHistory.push({role:"assistant",content,tool_calls: toolCalls});
				if(verbose) echo("tooling",calls.length);
				const toolResults = await processToolCalls(calls);
				for (const result of toolResults) {
				  rohaHistory.push({
					role: "tool",
					tool_call_id: result.tool_call_id,
					name: result.name,
					content: result.content
				  });
				}
				return relay(); // Recursive call to process tool results
			}
			reply = choice.message.content;
			if (roha.config && roha.config.ansi) {
//				echo(ansiSaveCursor);
				print(mdToAnsi(reply));
//				echo(ansiRestoreCursor);
			} else {
				print(wordWrap(reply));
			}
		}
		rohaHistory.push({ role: "assistant", content: reply });
	} catch (error) {
		let line=error.message || String(error);
		if(line.includes("maximum prompt length")){
			echo("Oops, maximum prompt length exceeded.");
			echo(cleanupRequired);
			return;
		}
		if(line.includes("maximum context length")){
			echo("Oops, maximum context length exceeded.");
			echo(cleanupRequired);
			return;
		}
		if(grokFunctions){
			if(line.includes("does not support Function Calling")){
				if(grokModel in roha.mut) {
					echo("mut",grokModel,"noFunctions",true);
					roha.mut[grokModel].noFunctions=true;
					await writeFoundry();
				}
				echo("resetting grokFunctions")
				grokFunctions=false;
				return;
			}
		}
		echo("unhandled error line:", line);
		if(verbose){
			echo(String(error));
		}
	}
}

async function chat() {
	dance:
	while (true) {
		let lines=[];
//		echo(ansiMoveToEnd);
		while (true) {
			await flush();
			let line="";
			if(listCommand){
				line=await promptFoundry("#");
				if(line && line.length && !isNaN(line)){
					let index=line|0;
					await callCommand(listCommand+" "+index);
				}
				listCommand="";
				continue;
			}else if(creditCommand){
				line=await promptFoundry("$");
				if(line&&line.length && !isNaN(line)){
					await creditCommand(line);
				}
				creditCommand="";
				continue;
			}else{
				line=await promptFoundry(lines.length?"+":rohaPrompt);
			}
			if (line === "") {
				if(roha.config.returntopush && !lines.length) {
					echo("auto pushing...");
					await callCommand("push");
					await relay();
				}
				break;
			}
			if(!line) break;//simon was here
			if (line === "exit") {
				echo("Ending the conversation...");
				break dance;
			}
			if (line.startsWith("/")) {
				const command = line.substring(1).trim();
				let dirty=await callCommand(command);
				if(dirty){
					lines.push("Please review source for bugs and all content if notable changes detected, thanks.");
					break;
				}
				continue;
			}
			lines.push(line.trim());
		}

		if (lines.length){
			const query=lines.join("\n");
			if(query.length){
				rohaHistory.push({ role: "user", content: query });
				await relay();
			}
		}
	}
}

// foundry uses rohaPath to boot

const fileExists = await pathExists(rohaPath);

if (!fileExists) {
	await Deno.writeTextFile(rohaPath, JSON.stringify(emptyRoha));
	echo("Created new",rohaPath);
}

// foundry lists models from active accounts

echo(rohaTitle,"running from "+rohaPath);

await flush();
await readFoundry();
const rohaEndpoint={};
for(let account in modelAccounts){
	let endpoint = await connectAccount(account);
	if(endpoint) {
		rohaEndpoint[account]=endpoint;
		await specAccount(account);
	}else{
		echo("endpoint failure for account",account);
	}
}

// foundry starts

await flush();
let grokModel = roha.model||"deepseek-chat@deepseek";
let grokFunctions=true;
let grokUsage = 0;

echo("present [",grokModel,"]");
echo("shares",roha.sharedFiles.length)
echo("use /help for latest and exit to quit");
echo("");

await flush();
let sessions=increment("sessions");
if(sessions==0||roha.config.showWelcome){
	let welcome=await Deno.readTextFile("welcome.txt");
	echo(welcome);
	await flush();
	await writeFoundry();
}

await flush();
if(roha.config){
	echo("commitonstart");
	await flush();
	if(roha.config.commitonstart) await commitShares();
}else{
	roha.config={};
}

await flush();
Deno.addSignalListener("SIGINT", () => {cleanup();Deno.exit(0);});

// debugstuff
// await openWithDefaultApp("foundry.json");
// await runCode("isolation/test.js","isolation");

await chat();
exitFoundry();
