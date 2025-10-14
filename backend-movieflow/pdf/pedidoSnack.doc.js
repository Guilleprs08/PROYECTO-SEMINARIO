// backend-movieflow/pdf/pedidoSnack.doc.js
const fmt = (n) => `Q ${Number(n || 0).toFixed(2)}`;

exports.buildPedidoSnackDoc = (data) => {
  const body = [
    [
      { text: '#', bold: true },
      { text: 'Descripción', bold: true },
      { text: 'Cant.', bold: true, alignment: 'right' },
      { text: 'Precio', bold: true, alignment: 'right' },
      { text: 'Subtotal', bold: true, alignment: 'right' }
    ],
    ...data.detalles.map((d, i) => {
      const labelTipo = (String(d.tipo || '').toUpperCase() === 'COMBO') ? 'Combo' : 'Producto';
      const desc = d.descripcion || d.desc || '';               // ← fallback seguro
      const precio = Number(d.precio ?? d.precioUnit ?? 0);     // ← fallback seguro
      const subtotal = Number(d.subtotal ?? d.importe ?? 0);    // ← fallback seguro

      return ([
        { text: String(i + 1), alignment: 'center' },
        { text: `${labelTipo}: ${desc}` },
        { text: String(d.cantidad ?? d.qty ?? 0), alignment: 'right' },
        { text: fmt(precio), alignment: 'right' },
        { text: fmt(subtotal), alignment: 'right' },
      ]);
    }),
  ];

  return {
    pageSize: 'A5',
    pageMargins: [20, 20, 20, 20],
    content: [
      { text: 'Comprobante de Pedido de Snacks - Cine MovieFlow', style: 'h1' },
      { text: `Pedido #${data.id}`, margin: [0, 4, 0, 2] },
      { text: `Fecha: ${new Date(data.creado).toLocaleString('es-GT')}` },
      { text: `Cliente: ${data.clienteNombre}` },
      { text: `Función: ${data.funcionId}   Sala: ${data.salaId}   Butaca: ${data.asiento}`, margin: [0, 0, 0, 10] },

      { table: { widths: [20, '*', 40, 60, 60], body }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 10] },

      {
        columns: [
          { width: '*', text: '' },
          {
            width: 'auto',
            table: {
              body: [
                ['Total',   fmt(data.total)],
                ['Efectivo',fmt(data.efectivo)],
                ['Cambio',  fmt(data.cambio)]
              ]
            },
            layout: 'noBorders'
          }
        ]
      },

      { text: `Estado: ${data.estado}`, margin: [0, 10, 0, 0] },
      { text: '¡Gracias por su compra!', italics: true, margin: [0, 6, 0, 0] }
    ],
    styles: { h1: { fontSize: 14, bold: true } }
  };
};

