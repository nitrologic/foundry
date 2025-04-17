// test2.js

// basic host to sandbox communications

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

async function sleep(ms) {
	await new Promise(function(resolve){setTimeout(resolve,ms);});
}

let host={port:{onmessage:[]}}

// use stdio to look like an onmessage pump
// assistant welcome
// could we use standard json rpc here?

function onReceive(message){
    console.log("I got a letter from the government the other day");
    console.log(message);
}

host.port.onmessage=onReceive;

console.log("radio   live transmission");

for(let i=0;i<5;i++){
    host.port.postMessage({name:"ping",i});
    sleep(1e3);
}
