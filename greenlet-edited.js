// Original file here: https://github.com/developit/greenlet

// I edited this so it allows you to pass a string that defines some global variables
// within the worker scope, and then the `transform` function is what gets "exported".
// EDIT: Changed so that __transformWrapper is what gets exported.

// I've also created a global greenletWorkers array and added the created workers to it so
// I can terminate all workers after I'm done with them.
window.greenletWorkers = [];

// And I also changed the worker to module worker, which required some changes.

function greenletEdited(asyncFunction) {
	// A simple counter is used to generate worker-global unique ID's for RPC:
	let currentId = 0;

	// Outward-facing promises store their "controllers" (`[request, reject]`) here:
	const promises = {};

	// Use a data URI for the worker's src. It inlines the target function and an RPC handler:
	const script = asyncFunction.toString().replace(/(\s)(async function __transformWrapper[ (])/, "$1self.$$$$=$2")+';onmessage='+(e => {
		/* global $$ */

		// Invoking within then() captures exceptions in the supplied async function as rejections
		Promise.resolve(e.data[1]).then(
			v => $$.apply($$, v)
		).then(
			// success handler - callback(id, SUCCESS(0), result)
			// if `d` is transferable transfer zero-copy
			d => {
				postMessage([e.data[0], 0, d], [d].filter(x => (
					(x instanceof ArrayBuffer) ||
					(x instanceof MessagePort) ||
					(self.ImageBitmap && x instanceof ImageBitmap)
				)));
			},
			// error handler - callback(id, ERROR(1), error)
			er => { postMessage([e.data[0], 1, '' + er]); }
		);
	});
	const workerURL = URL.createObjectURL(new Blob([script], {type:"text/javascript"}));
	// Create an "inline" worker (1:1 at definition time)
	const worker = new Worker(workerURL, {type:"module"});

	window.greenletWorkers.push(worker);

	/** Handle RPC results/errors coming back out of the worker.
	 *  Messages coming from the worker take the form `[id, status, result]`:
	 *    id     - counter-based unique ID for the RPC call
	 *    status - 0 for success, 1 for failure
	 *    result - the result or error, depending on `status`
	 */
	worker.onmessage = e => {
		// invoke the promise's resolve() or reject() depending on whether there was an error.
		promises[e.data[0]][e.data[1]](e.data[2]);

		// ... then delete the promise controller
		promises[e.data[0]] = null;
	};

	// Return a proxy function that forwards calls to the worker & returns a promise for the result.
	return function (args) {
		args = [].slice.call(arguments);
		return new Promise(function () {
			// Add the promise controller to the registry
			promises[++currentId] = arguments;

			// Send an RPC call to the worker - call(id, params)
			// The filter is to provide a list of transferables to send zero-copy
			worker.postMessage([currentId, args], args.filter(x => (
				(x instanceof ArrayBuffer) ||
				(x instanceof MessagePort) ||
				(self.ImageBitmap && x instanceof ImageBitmap)
			)));
		});
	};
}
