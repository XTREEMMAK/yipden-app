import { parseXml, XmlElement, type XmlDocument } from '@rgrove/parse-xml';

/**
 * XML parsing, hardened.
 *
 * `@rgrove/parse-xml` was chosen over the alternatives for one reason above speed: it does not
 * implement external entities or DTD entity definitions at all, so XXE and billion laughs style
 * expansion are not options it can be talked into. The remaining work here is bounding the
 * input before it reaches the parser, and making namespaced feeds readable without a namespace
 * resolver.
 */

/** A feed past this is either broken or hostile. Real feeds are a few hundred kilobytes. */
export const MAX_XML_BYTES = 5_000_000;

export class FeedParseError extends Error {
	override name = 'FeedParseError';
}

export function parseFeedXml(xml: string, maxBytes: number = MAX_XML_BYTES): XmlDocument {
	if (xml.length > maxBytes) {
		throw new FeedParseError(`feed document exceeds ${maxBytes} bytes`);
	}
	try {
		return parseXml(xml.trim(), {
			// Real feeds carry HTML entities like &nbsp; that XML never defined. Failing the
			// whole feed over one of them would be pedantry; they are decoded in text handling.
			ignoreUndefinedEntities: true
		});
	} catch (cause) {
		throw new FeedParseError(cause instanceof Error ? cause.message : 'unparseable XML');
	}
}

/**
 * An element's name without its namespace prefix.
 *
 * Feeds are inconsistent about prefixes for the same namespace: one podcast feed writes
 * `itunes:duration`, another declares a different prefix for the same thing. Matching on the
 * local name and, where it matters, checking the namespace URI separately, reads more of the
 * real web than a strict resolver does.
 */
export function localName(element: XmlElement): string {
	const colon = element.name.indexOf(':');
	return (colon === -1 ? element.name : element.name.slice(colon + 1)).toLowerCase();
}

export function isElement(node: unknown): node is XmlElement {
	return node instanceof XmlElement;
}

export function childElements(parent: XmlElement): XmlElement[] {
	return parent.children.filter(isElement);
}

/** Direct children matching a local name, in document order. */
export function children(parent: XmlElement, name: string): XmlElement[] {
	const wanted = name.toLowerCase();
	return childElements(parent).filter((child) => localName(child) === wanted);
}

/** The first direct child matching any of the given local names, in the order given. */
export function child(parent: XmlElement, ...names: string[]): XmlElement | null {
	for (const name of names) {
		const found = children(parent, name)[0];
		if (found) return found;
	}
	return null;
}

/** Text of the first matching child, trimmed. Empty string when absent. */
export function childText(parent: XmlElement, ...names: string[]): string {
	return child(parent, ...names)?.text.trim() ?? '';
}

/** An attribute by name, ignoring any namespace prefix and case. */
export function attr(element: XmlElement, name: string): string | undefined {
	const wanted = name.toLowerCase();
	for (const [key, value] of Object.entries(element.attributes)) {
		const colon = key.indexOf(':');
		const local = (colon === -1 ? key : key.slice(colon + 1)).toLowerCase();
		if (local === wanted) return value;
	}
	return undefined;
}

/** Depth first search for the first element with this local name, at any depth. */
export function firstDescendant(parent: XmlElement, name: string): XmlElement | null {
	const wanted = name.toLowerCase();
	for (const element of childElements(parent)) {
		if (localName(element) === wanted) return element;
		const deeper = firstDescendant(element, wanted);
		if (deeper) return deeper;
	}
	return null;
}
