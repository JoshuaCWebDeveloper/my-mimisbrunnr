export const extractFilePart = (
    rawBody: Buffer,
    contentType: string
): Buffer | null => {
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) {
        return null;
    }
    const boundary = '--' + boundaryMatch[1];

    const bodyStr = rawBody.toString('binary'); // keep raw bytes alignment
    const parts = bodyStr.split(boundary);

    for (const part of parts) {
        // Skip preamble/epilogue
        if (!part || part === '--\r\n' || part === '--') continue;

        // Separate headers from body
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;

        const rawHeaders = part.slice(0, headerEnd);
        const bodySection = part.slice(headerEnd + 4); // after the blank line

        // Look for Content-Disposition with name="file"
        if (!/Content-Disposition:.*name="file"/i.test(rawHeaders)) {
            continue;
        }

        // bodySection may end with trailing \r\n-- or \r\n
        // strip trailing CRLF and possible closing markers
        let cleaned = bodySection;

        // remove trailing \r\n if present
        if (cleaned.endsWith('\r\n')) {
            cleaned = cleaned.slice(0, -2);
        }

        // At this point cleaned should be exactly the file content
        const buf = Buffer.from(cleaned, 'binary');
        return buf;
    }

    return null;
};
