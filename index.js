"use strict";
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
const shared_attrs = [
        {
            name: "mermaid_style",
            label: "Advanced style=\"\" for mermaid tag",
            type: "String",
            required: false,
        },
        {
            name: "parent_style",
            label: "Advanced style=\"\" for container tag",
            type: "String",
            required: false,
        },
    ];
const readState = (state, fields) => {
    "use strict";
    fields.forEach((f) => {
	"use strict";
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
                let node_table_opts = Array.from(new Set(fields
					.filter((f) => f.type === "Key")
					.map((f) => f.reftable_name)
					));
		node_table_opts = node_table_opts.filter((tname) => (2 <= fields.filter((f)=>f.reftable_name==tname).length));
                const node_tables = node_table_opts.map((tname) => Table.findOne({ name:  tname}));
                const node_view_opts = Object.fromEntries((await Promise.all(node_tables.map(async(t) => [t.name,await View.find_table_views_where(t.id,
				({ state_fields, viewtemplate, viewrow }) => viewrow.name !== context.viewname)]))
				).map(([tname,views]) => [tname,views.map(v=>v.name)]));
                const node_fields = Object.fromEntries(node_tables
					.map((t) => [t.name, t.getFields().filter((f)=>f.type.name=="String").map((f)=>f.name)]))
		let src_node_field_opts = {}, tgt_node_field_opts = {};
		const key_fields = fields.filter((f) => f.type === "Key");
		for(const tname of node_table_opts) {
		  const tbl_key_fieldnames = key_fields.filter(f=>f.reftable_name===tname).map(f=>f.name);
		  src_node_field_opts[tname] = tbl_key_fieldnames;
		  for(const fname of tbl_key_fieldnames)
		    tgt_node_field_opts[fname] = tbl_key_fieldnames.filter(f=>f!==fname);
		}
		const has_node_view = Object.entries(node_view_opts).filter(([k,v])=>v.length>0).map(([k,v])=>k);

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
                            required: false,
                            attributes: {
                                options: fields
                                    .filter((f) => f.type.name === "String")
                                    .map((f) => f.name)
                                    .join(),
                            },
                        },
                        ...expand_view_opts.length==0?[]:[{
                            name: "links_view",
                            label: "Links table Expand View",
                            //sublabel: "Click on node to show",
                            type: "String",
                            required: false,
                            attributes: {
                                options: expand_view_opts.join(),
                            },
                        }],
                        {   
                            name: "nodes_table",
                            label: "Nodes table name",
                            sublabel: "Choose table - list of nodes",
                            type: "String",
                            required: true,
                            attributes: {
                                options: node_table_opts.join(),
                            },
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
                            attributes: {
                                calcOptions: ['nodes_table', node_fields],
                            },
                        },
                        {   
                            name: "src_node_field",
                            label: "Source Node field",
                            sublabel: "Field in Links table with type 'Key'",
                            type: "String",
                            required: true,
                            attributes: {
                                calcOptions: ['nodes_table', src_node_field_opts],
                                //options: src_node_field_opts
                            },
                        },
                        {   
                            name: "dst_node_field",
                            label: "Destination Node field",
                            sublabel: "Field in Links table with type 'Key'",
                            type: "String",
                            required: true,
                            attributes: {
                                calcOptions: ['src_node_field', tgt_node_field_opts],
                            },
                        },
                        {
                            name: "nodes_view",
                            label: "Nodes table Expand View",
                            sublabel: "Click on node to show",
                            type: "String",
                            required: false,
                            showIf: { nodes_table: has_node_view },
                            attributes: {
                                calcOptions: ['nodes_table', node_view_opts],
                            }
                        },
                        ...shared_attrs
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
    viewname, 
    configuration,
    state,
    extraArgs
) => {
    "use strict";
    const {
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
	parent_style,
	mermaid_style,
    } = configuration;
    const table = await Table.findOne({ id: table_id });
    const fields = await table.getFields();
    readState(state, fields);
    const where = await stateFieldsToWhere({ fields, state });
    const joinFields = {
        sid: {ref:src_node_field, target:'id'},
        src: {ref:src_node_field, target:nodes_name_field},
        did: {ref:dst_node_field, target:'id'},
        dst: {ref:dst_node_field, target:nodes_name_field}
      };
    const rows = await table.getJoinedRows({joinFields, where});
    let nodes = new Set();    
    let mermaid_str=`\nflowchart ${graph_orientation}\n`;

/* example
 flowchart LR
      A[Client] --- B[Load Balancer]
      B-->C[Server01]
      B-->D(Server02)

*/

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

   rows.forEach(function(row, i) {
	"use strict";
	mermaid_str += 'a'+row['sid']+nsi[0]+row['src']+nsi[1]+
	links_style+(row[links_name_field]?'|'+row[links_name_field]+'|':'')+
	'a'+row['did']+nsi[0]+row['dst']+nsi[1]+'\n';
	if(nodes_view) {
	   nodes.add({id:row.sid, name: row.src});
	   nodes.add({id:row.did, name: row.dst});
	}
   });

   if(nodes_view) {
	Array.from(nodes).forEach(function(row) {
	    "use strict";
	   mermaid_str += 
		'click '+'a'+row['id']+' "/view/'+nodes_view+'?id='+row['id']+'" "'+row['name']+'"'+'\n';
	});
   }
   if(mermaid_str == `\nflowchart ${graph_orientation}\n`) {
       return div(`No rows found in ${table.name}.`);
   }
   return div({style: parent_style || false},
        div({
      id: "mermaid_id",
      class: "mermaid",
      style: mermaid_style || false,
    },
	`${mermaid_str}`
        )
    );
};
function mermaid_fieldview_run(v, req, attrs) {
    "use strict";
    const {
	parent_style,
	mermaid_style,
    } = attrs;
   return div({style: parent_style || false},
        div({
      //id: "mermaid_id",
      class: "mermaid",
      style: mermaid_style || false,
    },
	String(v)
        )
    );
}
const base_headers = `/plugins/public/saltcorn-mermaid@${
  require("./package.json").version
}`;
// https://cdnjs.com/libraries/mermaid
const headers = [
    {	// @mermaid-script@ 10.2.0
        script: `${base_headers}/mermaid.min.js`,
        integrity: "sha512-dXrRCacKAgxLUx/PjTiWYTzshYHJZEqa8VVIBruyJAPa2t2bzzkCfRSclVWBN2pls6w+wTsfbWKpbKd3KBwUaA==",
    },	// @/mermaid-script@
];

module.exports = {
    sc_plugin_api_version: 1,
    headers,
    fieldviews: {mermaid:{
        type: "String",
        isEdit: false,
        configFields: shared_attrs,
        run: mermaid_fieldview_run
    }},
    viewtemplates: [{
        name: "Mermaid",
        display_state_form: false,
        get_state_fields,
        configuration_workflow,
        run,
    }, ],
};
