import type { QueryParams } from "../models/types.mts";

export function formatFields(fields:string) {
    const fieldsArr = fields?.split(",");
    if(fieldsArr) {
        const filter = fieldsArr
        .map((field:string) => field.trim())
        .reduce((acc: Record<string, any>, current:string) => ({ ...acc, [current]: 1 }), {});
        // a longer form of doing this conversion
        // let filter: Record<string, any> = {};
        // if(fieldsArr) {
        //     fieldsArr.forEach((field:string) => {
        //      filter[field.trim()] = 1
        //     })      
        // };
        console.log("formatFields:",filter)
        return filter
    }
}



export function buildPaginationWrapper(totalCount:number, query:QueryParams) {
  // here we check to see if there is a limit...if yes convert it to a number, if no set it to the default of 20
    const limit= query.limit? parseInt(query.limit) : 20;
    const offset= query.offset? parseInt(query.offset) : 0;
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = Math.ceil(offset / limit)+1;
    const hasPreviousPage = currentPage > 1;
    const hasNextPage = currentPage < totalPages;
    let next, prev;
    // create a new URLSearchParams object from the query parameters. This will make it easy to modify the fields we need to, while passing all the others on.
    // This is a bit of a hack because we can't use the query object directly in our URLSearchParams constructor.
    const params = new URLSearchParams(query as Record<string, any>);
  if (hasPreviousPage) {
    params.set("offset", (offset - limit).toString());
    prev = `/?${params}`;
  }
  if (hasNextPage) {
    params.set("offset", (offset + limit).toString());
    next = `/?${params}`;
  }
       
  return {
        count: totalCount, 
        prev: prev || null, 
        next: next || null, 
        results: [] as any
  }
}

// escape any characters that have special meaning in a regular expression so user search terms are matched literally
export function escapeRegex(text:string) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitize(v:Record<string, any>) {
  if (typeof v === "object") {
      for (var key in v) {
        if (/^\$/.test(key) ) {
          delete v[key];
        } else {
          sanitize(v[key]);
        }
      }
    }
    return v;
};