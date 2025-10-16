const { sanitizeText } = require("../utils/pdfHelper");
const fmtQ = n => `Q${Number(n || 0).toFixed(2)}`;
const z = n => String(n).padStart(2,"0");

function labelVal(label, val, w=140){
  return { columns:[{text:`${label}:`,bold:true,width:w},{text: sanitizeText(val??"-")}], margin:[0,1,0,1] };
}

/* === Filtros: solo Sala (sin rango ni fechas) === */
function filtrosBlock(f = {}) {
  const out = [];
  const sala = f.salaNombre ?? f.sala;
  if (sala && sala !== "ALL") out.push(labelVal("Sala", sala));
  return out;
}

/* === KPIs en texto (como imagen 2) === */
function kpiList(k={}) {
  return {
    margin:[0,6,0,8],
    stack:[
      { text: `Ocupación Promedio: ${Number(k.ocupacionPromedio15d||0).toFixed(1)}%` },
      { text: `Total Asientos: ${Number(k.totalAsientos||0).toLocaleString()}` },
      { text: `Asientos Ocupados: ${Number(k.asientosOcupadosHoy||0).toLocaleString()}` },
      { text: `Salas Activas: ${Number(k.salasActivas||0).toLocaleString()}` },
    ]
  };
}

function tableOcupacionPorSala(rows=[]){
  const body = [[
    {text:"Sala",bold:true},
    {text:"Capacidad",bold:true,alignment:"right"},
    {text:"Ocupados",bold:true,alignment:"right"},
    {text:"% Ocupación",bold:true,alignment:"right"}
  ]];
  rows.forEach(r=>{
    const cap=Number(r.CAPACIDAD||0), occ=Number(r.OCUPADOS||0);
    const pct = cap? (100*occ/cap):0;
    body.push([
      sanitizeText(r.SALA||""),
      {text: cap.toLocaleString(), alignment:"right"},
      {text: occ.toLocaleString(), alignment:"right"},
      {text: `${pct.toFixed(1)}%`, alignment:"right"}
    ]);
  });
  return { table:{ headerRows:1, widths:["*","auto","auto","auto"], body }, layout:"lightHorizontalLines", margin:[0,4,0,8] };
}

function tableTendencia(rows=[]){
  const body = [[
    {text:"Día",bold:true},
    {text:"% Ocupación",bold:true,alignment:"right"}
  ]];
  rows.forEach(r=>{
    const dia = r.DIA || r.dia || null;
    const label = dia ? new Date(dia).toLocaleDateString("es-GT",{weekday:"long", day:"2-digit", month:"2-digit"}) : String(r.DIA_SEMANA||"");
    body.push([
      sanitizeText(label),
      {text: `${Number(r.PCT_OCUPACION||r.pct_ocupacion||0).toFixed(1)}%`, alignment:"right"}
    ]);
  });
  return { table:{ headerRows:1, widths:["*","auto"], body }, layout:"lightHorizontalLines", margin:[0,4,0,8] };
}

function tableDetalle(rows=[]){
  const body = [[
    {text:"Sala",bold:true},
    {text:"Día",bold:true},
    {text:"Capacidad",bold:true,alignment:"right"},
    {text:"Ocupados",bold:true,alignment:"right"},
    {text:"Disponibles",bold:true,alignment:"right"},
    {text:"% Ocupación",bold:true,alignment:"right"},
    {text:"Estado",bold:true,alignment:"center"}
  ]];
  rows.forEach(r=>{
    body.push([
      sanitizeText(r.SALA||""),
      sanitizeText(String((r.DIA_SEMANA||"").toString().trim())),
      {text: Number(r.CAPACIDAD||0).toLocaleString(), alignment:"right"},
      {text: Number(r.OCUPADOS||0).toLocaleString(), alignment:"right"},
      {text: Number(r.DISPONIBLES||0).toLocaleString(), alignment:"right"},
      {text: `${Number(r.PCT_OCUPACION||0).toFixed(1)}%`, alignment:"right"},
      {text: sanitizeText(r.ESTADO||""), alignment:"center"}
    ]);
  });
  return { table:{ headerRows:1, widths:["*","auto","auto","auto","auto","auto","auto"], body }, layout:"lightHorizontalLines", margin:[0,4,0,0] };
}

const buildReportesDeSalaDoc = (negocio={}, payload={})=>{
  const {
    nowFecha="", nowHora="", filtros={}, kpis={}, ocupacion=[], tendencia=[], detalle=[], charts={}
  } = payload;

  return {
    pageSize:"LETTER",
    pageMargins:[32,36,32,40],
    defaultStyle:{ font:"Roboto", fontSize:9 },
    styles:{
      headTitle:{ fontSize:14, bold:true, alignment:"center", margin:[0,2,0,2] },
      business:{ fontSize:10, alignment:"center" },
      small:{ fontSize:8, color:"#666" },
      card:{ fillColor:"#fff" }
    },
    footer:(currentPage, pageCount)=>({
      columns:[
        { text:`Página ${currentPage} de ${pageCount}`, style:"small" },
        { text:"Sistema POS v2.1", alignment:"right", style:"small" }
      ],
      margin:[32,10,32,0]
    }),
    content:[
      { text: sanitizeText(negocio.NOMBRE_CINE || "Comercial Guatemala"), style:"headTitle" },
      { text: sanitizeText(negocio.DIRECCION || ""), style:"business" },
      { text:`Tel: ${sanitizeText(negocio.TELEFONO||"")}  •  ${sanitizeText(negocio.CORREO||"")}`, style:"business", margin:[0,0,0,6] },

      { text:"REPORTE DE OCUPACIÓN DE SALAS", style:"headTitle", margin:[0,2,0,6] },
      { columns:[
          { text:`Fecha generación: ${nowFecha}`, style:"small" },
          { text:`Hora: ${nowHora}`, alignment:"right", style:"small" }
        ], margin:[0,0,0,6]
      },

      // Filtros (solo Sala)
      ...filtrosBlock(filtros),

      // KPIs como texto
      kpiList(kpis),

      // Gráficas capturadas desde el front (si llegan)
      ...(charts?.imgOcupacion ? [
        { text:"Ocupación por Sala (Gráfica)", bold:true, margin:[0,0,0,4] },
        { image: charts.imgOcupacion, width: 500, margin:[0,4,0,8] },
      ] : []),
      ...(charts?.imgTendencia ? [
        { text:"Tendencia Semanal (Gráfica)", bold:true, margin:[0,0,0,4] },
        { image: charts.imgTendencia, width: 500, margin:[0,4,0,8] },
      ] : []),

      // Tablas
      { text:"Ocupación por Sala", bold:true, margin:[0,0,0,4] },
      tableOcupacionPorSala(ocupacion),

      { text:"Tendencia Semanal", bold:true, margin:[0,0,0,4] },
      tableTendencia(tendencia),

      { text:"Detalle de Ocupación por Sala y Día", bold:true, margin:[0,2,0,4] },
      tableDetalle(detalle),
    ]
  };
};

module.exports = { buildReportesDeSalaDoc };
