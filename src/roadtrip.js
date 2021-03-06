import Route from './Route.js';
import watchLinks from './utils/watchLinks.js';
import isSameRoute from './utils/isSameRoute.js';
import window from './utils/window.js';
import routes from './routes.js';

// Enables HTML5-History-API polyfill: https://github.com/devote/HTML5-History-API
const location = window && ( window.history.location || window.location );

function noop () {}

let currentData = {};
let currentRoute = {
	enter: () => roadtrip.Promise.resolve(),
	leave: () => roadtrip.Promise.resolve()
};

let _target;
let isTransitioning = false;

const scrollHistory = {};
let uniqueID = 1;
let currentID = uniqueID;

const roadtrip = {
	base: '',
	Promise,

	add ( path, options ) {
		routes.push( new Route( path, options ) );
		return roadtrip;
	},

	start ( options = {} ) {
		const href = routes.some( route => route.matches( location.href ) ) ?
			location.href :
			options.fallback;

		if (options.silent) {
			let newData;
			let newRoute;
			
			// hack to set the current route without transition delay
			const target = _target = {
				href
			};
			
			for ( let i = 0; i < routes.length; i += 1 ) {
				const route = routes[i];
				newData = route.exec( target , true );
		
				if ( newData ) {
					newRoute = route;
					break;
				}
			}
			currentRoute = newRoute;
			
		}
		
		return roadtrip.goto( href, {
			replaceState: true,
			scrollX: window.scrollX,
			scrollY: window.scrollY
		});
	},

	goto ( href, options = {} ) {
		scrollHistory[ currentID ] = {
			x: window.scrollX,
			y: window.scrollY
		};

		let target;
		const promise = new roadtrip.Promise( ( fulfil, reject ) => {
			target = _target = {
				href,
				scrollX: options.scrollX || 0,
				scrollY: options.scrollY || 0,
				options,
				fulfil,
				reject
			};
		});

		_target.promise = promise;

		if ( isTransitioning ) {
			return promise;
		}

		_goto( target , options.hash);
		return promise;
	}
};

if ( window ) {
	watchLinks( href => roadtrip.goto( href ) );

	// watch history
	window.addEventListener( 'popstate', event => {
		if ( !event.state ) return; // hashchange, or otherwise outside roadtrip's control
		const scroll = scrollHistory[ event.state.uid ];

		_target = {
			href: location.href,
			scrollX: scroll.x,
			scrollY: scroll.y,
			popstate: true, // so we know not to manipulate the history
			fulfil: noop,
			reject: noop
		};

		_goto( _target );
		currentID = event.state.uid;
	}, false );
	
	// watch hash history
	window.addEventListener( 'hashchange', () => {

		_target = {
			href: location.href,
			scrollX: scroll.x,
			scrollY: scroll.y,
			popstate: true, // so we know not to manipulate the history
			fulfil: noop,
			reject: noop
		};

		_goto( _target, true );
		
	}, false );
}

function _goto ( target , hash = false) {
	let newRoute;
	let newData;

	for ( let i = 0; i < routes.length; i += 1 ) {
		const route = routes[i];
		newData = route.exec( target , hash);

		if ( newData ) {
			newRoute = route;
			break;
		}
	}

	if ( !newRoute || isSameRoute( newRoute, currentRoute, newData, currentData ) ) {
		target.fulfil();
		return;
	}

	scrollHistory[ currentID ] = {
		x: ( currentData.scrollX = window.scrollX ),
		y: ( currentData.scrollY = window.scrollY )
	};

	isTransitioning = true;

	let promise;

	if ( ( newRoute === currentRoute ) && newRoute.updateable ) {
		promise = newRoute.update( newData );
	} else {
		promise = roadtrip.Promise.all([
			currentRoute.leave( currentData, newData ),
			newRoute.beforeenter( newData, currentData )
		]).then( () => newRoute.enter( newData, currentData ) );
	}

	promise
		.then( () => {
			currentRoute = newRoute;
			currentData = newData;

			isTransitioning = false;

			// if the user navigated while the transition was taking
			// place, we need to do it all again
			if ( _target !== target ) {
				_goto( _target );
				_target.promise.then( target.fulfil, target.reject );
			} else {
				target.fulfil();
			}
		})
		.catch( target.reject );

	if ( target.popstate ) return;

	const { replaceState, invisible } = target.options;
	if ( invisible ) return;

	const uid = replaceState ? currentID : ++uniqueID;
	history[ replaceState ? 'replaceState' : 'pushState' ]( { uid }, '', target.href );

	currentID = uid;
	scrollHistory[ currentID ] = {
		x: target.scrollX,
		y: target.scrollY
	};
}

export default roadtrip;
