const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const { stateFieldsToWhere } = require("@saltcorn/data/plugin-helper");
const { sqlsanitize } = require("@saltcorn/db-common/internal");

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
                console.log("table_id", context.table_id);
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
                        {   // https://mermaid.js.org/syntax/flowchart.html
                            name: "graph_orientation",
                            label: "Flowchart orientation ",
                            sublabel: "TB-top to bottom,BT-bottom to top,LR-left to right,RL-rigth to left. Default is 'TB'",
                            type: "String",
                            required: true,
                            attributes: {
                                options: "TB,BT,LR,RL",
                            },
                        },
                        {   // https://mermaid.js.org/syntax/flowchart.html#links-between-nodes
                            name: "links_style",
                            label: "Links visualization style",
                            sublabel: "Links connect node. Choose link style",
                            type: "String",
                            required: true,
                            attributes: {
                                options: "---,-->,-.->,-.-,==>,--o,--x,<-->,o--o,x--x",
                            },
                        },
                        {
                            name: "links_name_field",
                            label: "Link name field",
                            sublabel: "Field type need to be 'String'",
                            type: "String",
                            required: true,
                            attributes: {
                                options: fields
                                    .filter((f) => f.type.name === "String")
                                    .map((f) => f.name)
                                    .join(),
                            },
                        },
                        {
                            name: "links_view",
                            label: "Links table Expand View",
                            //sublabel: "Click on node to show",
                            type: "String",
                            required: false,
                            attributes: {
                                options: expand_view_opts.join(),
                            },
                        },
                        {   
                            name: "nodes_table",
                            label: "Nodes table name",
                            sublabel: "Choose table - list of nodes",
                            type: "String",
                            required: true,
                        },
                        {   
                            name: "nodes_style",
                            label: "Nodes visualization style",
                            sublabel: "Choose style",
                            type: "String",
                            required: true,
                            attributes: {
                                options: "[],(),[()],[[]],([]),(()),>],{}",
                            },
                        },
                        {
                            name: "nodes_name_field",
                            label: "Nodes name field",
                            sublabel: "Field in Nodes table with type 'String'",
                            type: "String",
                            required: true,
/*                            attributes: {
                                options: fields
                                    .filter((f) => f.type.name === "String")
                                    .map((f) => f.name)
                                    .join(),
                            },
*/
                        },
                        {   
                            name: "src_node_field",
                            label: "Source Node field",
                            sublabel: "Field in Links table with type 'Key'",
                            type: "String",
                            required: true,
                            attributes: {
                                options: fields
                                    .filter((f) => f.type.name === "Key")
                                    .map((f) => f.name)
                                    .join(),
                            },
                        },
                        {   
                            name: "dst_node_field",
                            label: "Destination Node field",
                            sublabel: "Field in Links table with type 'Key'",
                            type: "String",
                            required: true,
                            attributes: {
                                options: fields
                                    .filter((f) => f.type.name === "Key")
                                    .map((f) => f.name)
                                    .join(),
                            },
                        },
                        {   
                            name: "nodes_view",
                            label: "Nodes table Expand View",
                            sublabel: "Click on node to show",
                            type: "String",
                            required: false,
                        },
                    ],
                });
            },
        }, 
      ],
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
	graph_orientation,
	links_view,
	links_name_field,
	links_style,
	nodes_table,
	nodes_name_field,
	nodes_style,
	nodes_view,
	src_node_field,
	dst_node_field,
    },
    state,
    extraArgs
) => {
    const table = await Table.findOne({ id: table_id });
    const fields = await table.getFields();
    readState(state, fields);
    const qstate = await stateFieldsToWhere({ fields, state });
    const rows = await table.getRows(qstate);
    
    let mermaid_str=`\nflowchart ${graph_orientation}\n`;

/* example
 flowchart LR
      A[Client] --- B[Load Balancer]
      B-->C[Server01]
      B-->D(Server02)

*/

   const schema = db.getTenantSchemaPrefix();
   const dbrows = await db.query(

`select 
	s.${nodes_name_field} as "src", 
	d.${nodes_name_field} as "dst", 
	l.${links_name_field} as "link",
	l.${src_node_field} as "sid", 
	l.${dst_node_field} as "did"
from 
	${schema}"${sqlsanitize(table.name)}" l, ${schema}"${sqlsanitize(nodes_table)}" s, ${schema}"${sqlsanitize(nodes_table)}" d
where 
	l.${src_node_field} = s.id 
and 
	l.${dst_node_field} = d.id`

);
   // [],(),[()],[[]],([]),(()),>],{}
   const nodes_style_items = new Map([
     ["[]"  ,["[" , "]" ]],
     ["()"  ,["(" , ")" ]],
     ["[()]",["[(", ")]"]],
     ["[[]]",["[[", "]]"]],
     ["([])",["([", "])"]],
     ["(())",["((", "))"]],
     [">]"  ,[">" , "]" ]],
     ["{}"  ,["{" , "}" ]]
   ]);
   const nsi = nodes_style_items.get(nodes_style);

   dbrows.rows.forEach(function(row) { 	
	mermaid_str += 'a'+row['sid']+nsi[0]+row['src']+nsi[1]+
	links_style+'|'+row['link']+'|'+ 
	'a'+row['did']+nsi[0]+row['dst']+nsi[1]+'\n'; 
   });

   if (nodes_view){

	const dbrows1 = await db.query(

`select 
	a.id as "id", 
	a.${nodes_name_field} as "name"
from ${schema}"${sqlsanitize(nodes_table)}" a`

	);
	// prepare nodes list
        // click a1 "/view/NodeShow?id=1" "Node1"
	dbrows1.rows.forEach(function(row) { 	

		mermaid_str += 
		'click '+'a'+row['id']+' "/view/'+nodes_view+'?id='+row['id']+'" "'+row['name']+'"'+'\n';

	}); 
   }
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