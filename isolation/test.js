
function hexDate(){
    let s=Date.now()/1e3|0;
    return s.toString(16);
}

async function sleep(ms) {
	await new Promise(function(resolve){setTimeout(resolve,ms);});
}

console.log("radio   live transmission");
console.log(hexDate());
await sleep(2e3);
console.log(hexDate());
