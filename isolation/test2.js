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






//async function promptFoundry(message) {
//		await writer.write(encoder.encode(message));
//		await writer.ready;
//	}


async function exitTest(){

}
async function radar(){
	var promptBuffer = new Uint8Array(0);
	Deno.stdin.setRaw(true);
	try {
		let busy = true;
		while (busy) {
			const { value, done } = await reader.read();
			if (done || !value) break;
			var bytes = [];
			for (const byte of value) {
				if (byte === 0x7F || byte === 0x08) { // Backspace
					if (promptBuffer.length > 0) {
						promptBuffer = promptBuffer.slice(0, -1);
						bytes.push(0x08, 0x20, 0x08);
					}
				} else if (byte === 0x1b) { // Escape sequence
					if (value.length === 1) {
						await exitTest();
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
