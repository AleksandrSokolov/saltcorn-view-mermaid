const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const { stateFieldsToWhere } = require("@saltcorn/data/plugin-helper");

const db = require("@saltcorn/data/db");

const {
    text,
    div,
    h3,
    style,
    a,
    script,
    pre,
    domReady,
    i,
} = require("@saltcorn/markup/tags");
const readState = (state, fields) => {
    fields.forEach((f) => {
        const current = state[f.name];
        if (typeof current !== "undefined") {
            if (f.type.read) state[f.name] = f.type.read(current);
            else if (f.type === "Key")
                state[f.name] = current === "null" ? null : +current;
        }
    });
    return state;
};
const configuration_workflow = () =>
    new Workflow({
        steps: [{
            name: "views",
            form: async(context) => {
                const table = await Table.findOne({ id: context.table_id });
                const fields = await table.getFields();

                const expand_views = await View.find_table_views_where(
                    context.table_id,
                    ({ state_fields, viewtemplate, viewrow }) =>
                    viewrow.name !== context.viewname
                );
                const expand_view_opts = expand_views.map((v) => v.name);

                const create_views = await View.find_table_views_where(
                    context.table_id,
                    ({ state_fields, viewrow }) =>
                    viewrow.name !== context.viewname &&
                    state_fields.every((sf) => !sf.required)
                );
                const create_view_opts = create_views.map((v) => v.name);

                // create new view

                return new Form({
                    fields: [
                        {
                            name: "title",
                            label: "Mermaid diagramm",
                            sublabel: "Choose diagramm title",
                            required: false,
                            type: "String",
                        },
                        {
                            name: "graph_mode",
                            label: "Mermaid mode",
                            sublabel: "Choose mermaid mode",
                            required: true,
                            type: "String",
                            attributes: {
                                options: "graph TD,graph LR,graph TR",
                            },
                        },
                        {
                            name: "link",
                            label: "link field",
                            sublabel: "Enter link name field",
                            required: false,
                            type: "String",
                        },
/*                        {
                            name: "link_name",
                            label: "link field",
                            sublabel: "Enter link name field",
                            required: false,
                            type: "String",
                        },
*/
                    ],
                });
            },
        }, ],
    });

const get_state_fields = async(table_id, viewname, { show_view }) => {
    const table_fields = await Field.find({ table_id });
    return table_fields.map((f) => {
        const sf = new Field(f);
        sf.required = false;
        return sf;
    });
};
const run = async(
    table_id,
    viewname, {
	title,
        graph_mode,
	link_name,
    },
    state,
    extraArgs
) => {
    const table = await Table.findOne({ id: table_id });
    const fields = await table.getFields();
    readState(state, fields);
    const qstate = await stateFieldsToWhere({ fields, state });
    const rows = await table.getRows(qstate);
    //return {}; //{ name , start, end, progress: row[progress_field], custom_class };
    let mermaid_str=`\n
---
${title}
---
${graph_mode}
\n`;
    const srcapp = 'srcapp';
    const dstapp = 'destapp';
    // defines Tasks List 
/*
    const tmp = rows.map((row) => {
	mermaid_str += row[srcapp]+'---'+row[dstapp]+'\n';
    });
*/
/*
 graph LR
      A[Client] --- B[Load Balancer]
      B-->C[Server01]
      B-->D(Server02)

*/

   const dbrows = await db.query(`select 
s.name as "src", d.name as "dst", l.name as "link",
l.srcapp as "sid", l.destapp as "did"
from applinks l, apps s, apps d
where l.srcapp = s.id 
and l.destapp = d.id`);

/*    const dbtmp = dbrows.map((row) => {
	mermaid_str += row['src']+'---'+row['dst']+'\n';
    });
*/
//   console.log(dbrows);
   dbrows.rows.forEach(function(row) { 	
	mermaid_str += 'a'+row['sid']+'['+row['src']+']---'+
	'|'+row['link']+'|'+
	'a'+row['did']+'['+row['dst']+']\n'; 
   });


    return div(
        div(    {
      id: "mermaid_id",
      class: "mermaid",
    },
	`${mermaid_str}`
        )
    );
};
// https://cdnjs.com/libraries/mermaid
const headers = [{
        script: "https://cdnjs.cloudflare.com/ajax/libs/mermaid/9.3.0/mermaid.min.js",
        integrity: "sha512-ku2nmBrzAXY5YwohzTqLYH1/lvyMrpTVxgQKrvTabd/b/uesqltLORdmpVapYv6QhZVCLUX6wkvFaKOAY4xpUA==",
    },
//    {
//        css: "https://cdnjs.cloudflare.com/ajax/libs/frappe-gantt/0.5.0/frappe-gantt.css",
//        integrity: "sha512-qxE5FnEACGZSuLsbaDLCYuMRrxuLhQz1HtOJ2+3dHXSnFlckToa1rXHajkgLciNSdq+FCE4ey8R8fqjrD3HO0g==",
//    },
];

module.exports = {
    sc_plugin_api_version: 1,
    headers,
    viewtemplates: [{
        name: "Mermaid",
        display_state_form: false,
        get_state_fields,
        configuration_workflow,
        run,
    }, ],
};