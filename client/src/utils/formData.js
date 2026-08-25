/**
 * Shared FormData builder for multipart/form-data API requests.
 *
 * Used by groupsService and templatesService to avoid duplicated logic.
 */

/**
 * Build a FormData object from a data object, optional images array,
 * and optional per-IG-type media map.
 *
 * @param {Object} data — key-value pairs to append (objects/arrays are JSON-stringified)
 * @param {File[]} [images] — generic image files to attach under "images"
 * @param {Object} [igTypeMedia] — { FEED: File[], STORY: File[], REEL: File[] }
 * @returns {FormData}
 */
export function buildFormData(data, images, igTypeMedia) {
  const fd = new FormData();
  Object.entries(data).forEach(([key, val]) => {
    if (val === null || val === undefined) return;
    if (Array.isArray(val) || (typeof val === "object" && val !== null))
      fd.append(key, JSON.stringify(val));
    else fd.append(key, val);
  });
  if (images?.length) {
    for (const img of images) fd.append("images", img);
  }
  if (igTypeMedia) {
    for (const [type, files] of Object.entries(igTypeMedia)) {
      if (files?.length) {
        for (const f of files) fd.append(`igMedia_${type}`, f);
      }
    }
  }
  return fd;
}
