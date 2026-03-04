import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Analytics } from '@vercel/analytics/react'; 
import { SpeedInsights } from '@vercel/speed-insights/react'; 

// --- CONFIGURACIÓN SUPABASE ---
const supabaseUrl = 'https://zvypvqyawwkghqnmiazq.supabase.co';
const supabaseKey = 'sb_publishable_kx9ImY8obdsR-EPEB70c7w_EePKNmE1';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- UTILIDAD GLOBAL PARA MONEDA (SIEMPRE 2 DECIMALES) ---
const formatCurrency = (monto) => {
  return Number(Math.abs(monto || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const formatCurrencyConSigno = (monto) => {
  const num = Number(monto || 0);
  return num < 0 ? `-$ ${formatCurrency(num)}` : `$ ${formatCurrency(num)}`;
};

// --- DATOS INICIALES: TABLA DE GANANCIAS 2025 (ART. 94) ---
const escalaGanancias2025Inicial = [
  { limiteInferior: 0, limiteSuperior: 1749901.45, fijoPagar: 0, alicuotaVariable: 0.05, sobreExcedente: 0 },
  { limiteInferior: 1749901.45, limiteSuperior: 3499802.89, fijoPagar: 87495.07, alicuotaVariable: 0.09, sobreExcedente: 1749901.45 },
  { limiteInferior: 3499802.89, limiteSuperior: 5249704.34, fijoPagar: 244986.20, alicuotaVariable: 0.12, sobreExcedente: 3499802.89 },
  { limiteInferior: 5249704.34, limiteSuperior: 7874556.52, fijoPagar: 454974.38, alicuotaVariable: 0.15, sobreExcedente: 5249704.34 },
  { limiteInferior: 7874556.52, limiteSuperior: 15749113.04, fijoPagar: 848702.20, alicuotaVariable: 0.19, sobreExcedente: 7874556.52 },
  { limiteInferior: 15749113.04, limiteSuperior: 23623669.56, fijoPagar: 2344867.94, alicuotaVariable: 0.23, sobreExcedente: 15749113.04 },
  { limiteInferior: 23623669.56, limiteSuperior: 35435504.34, fijoPagar: 4156015.94, alicuotaVariable: 0.27, sobreExcedente: 23623669.56 },
  { limiteInferior: 35435504.34, limiteSuperior: 53153256.52, fijoPagar: 7345211.33, alicuotaVariable: 0.31, sobreExcedente: 35435504.34 },
  { limiteInferior: 53153256.52, limiteSuperior: Infinity, fijoPagar: 12837714.51, alicuotaVariable: 0.35, sobreExcedente: 53153256.52 },
];

// --- FUNCIÓN DE CÁLCULO PROGRESIVO DE GANANCIAS ---
const calcularGananciaProgresiva = (baseNeta, tabla) => {
  if (baseNeta <= 0) return { impuestoDeterminado: 0, tramoAplicado: null, fijo: 0, variable: 0, excedente: 0, tasaVariablePercent: 0 };
  const tramo = tabla.find(t => baseNeta > t.limiteInferior && baseNeta <= t.limiteSuperior) || tabla[tabla.length - 1];
  const componenteFijo = tramo.fijoPagar;
  const componenteVariable = (baseNeta - tramo.sobreExcedente) * tramo.alicuotaVariable;
  return {
    impuestoDeterminado: componenteFijo + componenteVariable, tramoAplicado: tramo,
    fijo: componenteFijo, variable: componenteVariable, excedente: baseNeta - tramo.sobreExcedente, tasaVariablePercent: tramo.alicuotaVariable * 100
  };
};

// --- COMPONENTE 2: CASH FLOW, DEUDAS Y CALENDARIO ---
const FinancialDashboard = ({ facturas, movimientos, onDeleteMovimiento, onEditMovimiento }) => {
  const [detalleDeuda, setDetalleDeuda] = useState(null); 
  const [detalleDiaCalendario, setDetalleDiaCalendario] = useState(null); // NUEVO ESTADO PARA CALENDARIO
  const [filtroCashFlow, setFiltroCashFlow] = useState('');
  const [filtroManuales, setFiltroManuales] = useState('');
  const [mesCalendario, setMesCalendario] = useState(new Date());

  // TECLA ESC PARA CERRAR DETALLES
  useEffect(() => {
    const handleEsc = (e) => { 
      if (e.key === 'Escape') {
        setDetalleDeuda(null); 
        setDetalleDiaCalendario(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const posicion = useMemo(() => {
    const hoy = new Date().toISOString().split('T')[0];
    let cajaHoy = 0, inversiones = 0, aCobrarFuturo = 0, aPagarFuturo = 0;

    movimientos.forEach(mov => {
      const esFuturo = mov.fecha_efectiva > hoy;
      const monto = Number(mov.importe);
      let esIngreso = false;
      let esEgreso = false;

      if (['saldo_inicial', 'inversion_rescate', 'saldo_inicial_inversion', 'interes_inversion'].includes(mov.tipo_movimiento)) esIngreso = true;
      else if (['inversion_ingreso', 'pago_impuesto', 'pago_servicio', 'gasto_vario', 'pago_autonomos', 'retencion_sircreb', 'vencimiento_tarjeta', 'retencion_ley_25413'].includes(mov.tipo_movimiento)) esEgreso = true;
      else if (mov.tipo_movimiento === 'factura') {
        const f = facturas.find(x => x.id === mov.factura_id);
        if (f) {
           if (f.tipo === 'Venta') esIngreso = true;
           else esEgreso = true;
        }
      }

      if (['inversion_ingreso', 'saldo_inicial_inversion', 'interes_inversion'].includes(mov.tipo_movimiento)) inversiones += monto;
      if (mov.tipo_movimiento === 'inversion_rescate') inversiones -= monto;

      if (!['inversion_ingreso', 'inversion_rescate', 'saldo_inicial_inversion', 'interes_inversion'].includes(mov.tipo_movimiento)) {
        if (!esFuturo) {
           if (esIngreso) cajaHoy += monto; 
           if (esEgreso) cajaHoy -= monto;
        } else {
           if (esIngreso) aCobrarFuturo += monto; 
           if (esEgreso) aPagarFuturo += monto;
        }
      } else if (!esFuturo) {
        if (mov.tipo_movimiento === 'inversion_ingreso') cajaHoy -= monto;
        if (mov.tipo_movimiento === 'inversion_rescate') cajaHoy += monto;
      }
    });
    return { cajaHoy, inversiones, aCobrarFuturo, aPagarFuturo };
  }, [movimientos, facturas]);

  const flujoEvolutivo = useMemo(() => {
    const movsCaja = movimientos.filter(m => !['saldo_inicial_inversion', 'interes_inversion'].includes(m.tipo_movimiento));
    const movsOrdenados = [...movsCaja].sort((a, b) => a.fecha_efectiva.localeCompare(b.fecha_efectiva));
    
    let saldoAcumulado = 0;
    return movsOrdenados.map(mov => {
      let monto = Number(mov.importe);
      let esIngreso = false;
      let descripcion = mov.nota || mov.tipo_movimiento.replace(/_/g, ' ').toUpperCase();

      if (['saldo_inicial', 'inversion_rescate'].includes(mov.tipo_movimiento)) esIngreso = true;
      else if (['inversion_ingreso', 'pago_impuesto', 'pago_servicio', 'gasto_vario', 'pago_autonomos', 'retencion_sircreb', 'vencimiento_tarjeta', 'retencion_ley_25413'].includes(mov.tipo_movimiento)) esIngreso = false;
      else if (mov.tipo_movimiento === 'factura') {
        const f = facturas.find(x => x.id === mov.factura_id);
        if (f) {
           esIngreso = f.tipo === 'Venta';
           descripcion = `${esIngreso ? 'Cobro' : 'Pago'} FC - ${f.entidad} ${mov.nota ? `(${mov.nota})` : ''}`;
        }
      }

      if (esIngreso) saldoAcumulado += monto;
      else saldoAcumulado -= monto;

      return {
        id: mov.id, fecha: mov.fecha_efectiva, descripcion,
        ingreso: esIngreso ? monto : 0, egreso: !esIngreso ? monto : 0, saldoFinal: saldoAcumulado
      };
    });
  }, [movimientos, facturas]);

  const cuentasCorrientes = useMemo(() => {
    const clientes = {}; const proveedores = {};
    facturas.forEach(f => {
      if (Math.abs(f.saldo) > 0.01) { 
        const key = f.cuit_entidad || f.entidad;
        if (f.tipo === 'Venta') {
           if (!clientes[key]) clientes[key] = { entidad: f.entidad, cuit: f.cuit_entidad || 'S/D', saldo: 0, cantidad: 0, comprobantes: [] };
           clientes[key].saldo += f.saldo; clientes[key].cantidad += 1; clientes[key].comprobantes.push(f);
        } else {
           if (!proveedores[key]) proveedores[key] = { entidad: f.entidad, cuit: f.cuit_entidad || 'S/D', saldo: 0, cantidad: 0, comprobantes: [] };
           proveedores[key].saldo += f.saldo; proveedores[key].cantidad += 1; proveedores[key].comprobantes.push(f);
        }
      }
    });
    return { clientes: Object.values(clientes), proveedores: Object.values(proveedores) };
  }, [facturas]);

  const cashFlowFiltrado = flujoEvolutivo.filter(row => 
    row.descripcion.toLowerCase().includes(filtroCashFlow.toLowerCase()) ||
    row.fecha.includes(filtroCashFlow) ||
    row.ingreso.toString().includes(filtroCashFlow) ||
    row.egreso.toString().includes(filtroCashFlow)
  );

  const movimientosManuales = movimientos.filter(m => m.tipo_movimiento !== 'factura');
  const manualesFiltrados = movimientosManuales.filter(m => 
    (m.nota && m.nota.toLowerCase().includes(filtroManuales.toLowerCase())) ||
    m.tipo_movimiento.toLowerCase().replace(/_/g, ' ').includes(filtroManuales.toLowerCase()) ||
    m.fecha_pago.includes(filtroManuales) ||
    m.importe.toString().includes(filtroManuales)
  );

  // LOGICA DEL CALENDARIO
  const renderCalendario = () => {
    const year = mesCalendario.getFullYear();
    const month = mesCalendario.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Dom, 1 = Lun
    
    let startOffset = firstDay - 1;
    if (startOffset < 0) startOffset = 6; 

    const diasNulos = Array.from({ length: startOffset }, (_, i) => <div key={`blank-${i}`} className="p-2 border border-transparent"></div>);
    const nombreMes = mesCalendario.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

    const dias = Array.from({ length: daysInMonth }, (_, i) => {
       const day = i + 1;
       const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
       const esHoy = dateStr === new Date().toISOString().split('T')[0];

       // Sumar ingresos y egresos de este día particular
       const flowsDia = flujoEvolutivo.filter(f => f.fecha === dateStr);
       const sumIn = flowsDia.reduce((acc, curr) => acc + curr.ingreso, 0);
       const sumOut = flowsDia.reduce((acc, curr) => acc + curr.egreso, 0);

       return (
         <div key={day} onClick={() => setDetalleDiaCalendario({ fecha: dateStr, flows: flowsDia, sumIn, sumOut })} className={`p-2 border rounded-lg flex flex-col items-start justify-start min-h-[5rem] cursor-pointer hover:bg-gray-50 ${esHoy ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'bg-white border-gray-200'} shadow-sm transition hover:shadow-md`}>
            <span className={`font-bold text-xs mb-1 ${esHoy ? 'text-blue-800' : 'text-gray-500'}`}>{day}</span>
            <div className="flex flex-col gap-1 w-full text-[10px] font-bold">
               {sumIn > 0 && <span className="text-green-700 bg-green-100 px-1 py-0.5 rounded truncate" title={`Ingreso: $${formatCurrency(sumIn)}`}>+ ${formatCurrency(sumIn)}</span>}
               {sumOut > 0 && <span className="text-red-700 bg-red-100 px-1 py-0.5 rounded truncate" title={`Egreso: $${formatCurrency(sumOut)}`}>- ${formatCurrency(sumOut)}</span>}
            </div>
         </div>
       );
    });

    return (
      <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
         <div className="flex justify-between items-center mb-4 border-b pb-3">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">📅 Calendario Financiero</h3>
            <div className="flex items-center gap-4 bg-gray-100 rounded-lg p-1">
               <button onClick={() => setMesCalendario(new Date(year, month - 1, 1))} className="px-3 py-1 hover:bg-white rounded shadow-sm text-gray-600 font-bold">←</button>
               <span className="font-bold text-sm text-gray-800 capitalize w-32 text-center">{nombreMes}</span>
               <button onClick={() => setMesCalendario(new Date(year, month + 1, 1))} className="px-3 py-1 hover:bg-white rounded shadow-sm text-gray-600 font-bold">→</button>
            </div>
         </div>
         <div className="grid grid-cols-7 gap-2 text-center mb-2 text-xs font-bold text-gray-400 uppercase">
            <span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span>
         </div>
         <div className="grid grid-cols-7 gap-2">
            {diasNulos}
            {dias}
         </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-blue-600">
          <p className="text-gray-500 text-xs uppercase font-bold">Caja Operativa</p>
          <p className="text-2xl font-bold text-gray-800">{formatCurrencyConSigno(posicion.cajaHoy)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-purple-500">
          <p className="text-gray-500 text-xs uppercase font-bold">Inversiones</p>
          <p className="text-2xl font-bold text-purple-700">{formatCurrencyConSigno(posicion.inversiones)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-orange-400 opacity-80">
          <p className="text-gray-500 text-xs uppercase font-bold">A Cobrar (Futuro)</p>
          <p className="text-xl font-bold text-orange-600">+ {formatCurrencyConSigno(posicion.aCobrarFuturo)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-red-400 opacity-80">
          <p className="text-gray-500 text-xs uppercase font-bold">A Pagar (Futuro)</p>
          <p className="text-xl font-bold text-red-600">- {formatCurrencyConSigno(posicion.aPagarFuturo)}</p>
        </div>
      </div>

      {/* RENDERIZADO DEL NUEVO CALENDARIO */}
      {renderCalendario()}

      <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
           <h3 className="font-bold text-gray-800 flex items-center gap-2">📊 Libro Mayor de Caja</h3>
           <input type="text" placeholder="🔍 Buscar movimiento..." className="p-2 border rounded-lg text-sm w-full md:w-64" value={filtroCashFlow} onChange={e => setFiltroCashFlow(e.target.value)} />
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-800 text-white uppercase text-xs sticky top-0 z-10">
              <tr>
                <th className="p-3">Fecha Efectiva</th><th className="p-3">Concepto</th>
                <th className="p-3 text-right text-green-400">Ingresos</th><th className="p-3 text-right text-red-400">Egresos</th>
                <th className="p-3 text-right font-bold bg-gray-700">Saldo Final</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-700">
              {cashFlowFiltrado.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="p-3 whitespace-nowrap">{new Date(row.fecha + 'T00:00:00').toLocaleDateString()}</td>
                  <td className="p-3 font-medium text-gray-600">{row.descripcion}</td>
                  <td className="p-3 text-right text-green-600 font-medium">{row.ingreso > 0 ? `+ ${formatCurrencyConSigno(row.ingreso)}` : '-'}</td>
                  <td className="p-3 text-right text-red-600 font-medium">{row.egreso > 0 ? `- ${formatCurrencyConSigno(row.egreso)}` : '-'}</td>
                  <td className={`p-3 text-right font-bold ${row.saldoFinal >= 0 ? 'text-blue-700 bg-blue-50' : 'text-red-700 bg-red-50'}`}>{formatCurrencyConSigno(row.saldoFinal)}</td>
                </tr>
              ))}
              {cashFlowFiltrado.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-gray-400">Sin movimientos encontrados.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-xl shadow border border-gray-200">
          <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">📉 Clientes (A Cobrar)</h3>
          <div className="overflow-y-auto max-h-60">
            {cuentasCorrientes.clientes.map((c, i) => (
               <div key={i} onClick={() => setDetalleDeuda({ ...c, tipo: 'Cliente' })} className="flex justify-between border-b p-3 text-sm cursor-pointer hover:bg-blue-50 transition group rounded">
                 <span className="font-medium flex items-center gap-2"><span className="text-gray-300 group-hover:text-blue-500">🔍</span> {c.entidad}</span>
                 <span className="text-red-600 font-bold">{formatCurrencyConSigno(c.saldo)}</span>
               </div>
            ))}
            {cuentasCorrientes.clientes.length === 0 && <p className="text-sm text-gray-400 p-2">Sin deudas pendientes.</p>}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow border border-gray-200">
          <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">📈 Proveedores (A Pagar)</h3>
           <div className="overflow-y-auto max-h-60">
            {cuentasCorrientes.proveedores.map((c, i) => (
               <div key={i} onClick={() => setDetalleDeuda({ ...c, tipo: 'Proveedor' })} className="flex justify-between border-b p-3 text-sm cursor-pointer hover:bg-orange-50 transition group rounded">
                 <span className="font-medium flex items-center gap-2"><span className="text-gray-300 group-hover:text-orange-500">🔍</span> {c.entidad}</span>
                 <span className="text-orange-600 font-bold">{formatCurrencyConSigno(c.saldo)}</span>
               </div>
            ))}
            {cuentasCorrientes.proveedores.length === 0 && <p className="text-sm text-gray-400 p-2">Sin deudas pendientes.</p>}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
           <h3 className="font-bold text-gray-800">📋 Edición de Movimientos Manuales</h3>
           <input type="text" placeholder="🔍 Buscar registro..." className="p-2 border rounded-lg text-sm w-full md:w-64" value={filtroManuales} onChange={e => setFiltroManuales(e.target.value)} />
        </div>
        <div className="overflow-x-auto max-h-60">
           <table className="w-full text-sm text-left">
             <thead className="bg-gray-50 uppercase text-xs text-gray-500 sticky top-0 z-10">
                <tr><th className="p-3">Fecha</th><th className="p-3">Tipo</th><th className="p-3">Descripción</th><th className="p-3 text-right">Importe</th><th className="p-3 text-center">Acciones</th></tr>
             </thead>
             <tbody className="divide-y">
               {manualesFiltrados.map(m => (
                 <tr key={m.id} className="hover:bg-gray-50">
                    <td className="p-3">{m.fecha_pago}</td>
                    <td className="p-3"><span className="text-xs font-bold px-2 py-1 rounded bg-gray-100">{m.tipo_movimiento.replace(/_/g, ' ').toUpperCase()}</span></td>
                    <td className="p-3 text-gray-600">{m.nota}</td>
                    <td className="p-3 text-right font-mono font-bold">{formatCurrencyConSigno(m.importe)}</td>
                    <td className="p-3 text-center flex justify-center gap-2">
                       <button onClick={() => onEditMovimiento(m)} className="text-blue-500 hover:bg-blue-100 px-2 py-1 rounded font-bold text-xs transition">✎ Editar</button>
                       <button onClick={() => onDeleteMovimiento(m.id)} className="text-red-500 hover:bg-red-100 px-2 py-1 rounded font-bold text-xs transition">🗑 Borrar</button>
                    </td>
                 </tr>
               ))}
               {manualesFiltrados.length === 0 && <tr><td colSpan="5" className="p-4 text-center text-gray-400">No hay movimientos encontrados.</td></tr>}
             </tbody>
           </table>
        </div>
      </div>

      {/* MODAL DETALLE DE DEUDA */}
      {detalleDeuda && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden animate-fade-in-up">
            <div className={`p-6 border-b flex justify-between items-start ${detalleDeuda.tipo === 'Cliente' ? 'bg-blue-50' : 'bg-orange-50'}`}>
               <div>
                 <h3 className="text-xl font-bold text-gray-800">Detalle de {detalleDeuda.tipo}</h3>
                 <p className="text-lg font-medium text-gray-700">{detalleDeuda.entidad}</p>
                 <p className="text-xs text-gray-500">CUIT: {detalleDeuda.cuit}</p>
               </div>
               <div className="text-right">
                 <p className="text-xs text-gray-500 uppercase">Deuda Total</p>
                 <p className={`text-3xl font-bold ${detalleDeuda.tipo === 'Cliente' ? 'text-red-600' : 'text-orange-600'}`}>{formatCurrencyConSigno(detalleDeuda.saldo)}</p>
               </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase text-gray-400 border-b">
                  <tr><th className="pb-3">Fecha</th><th className="pb-3">Comprobante</th><th className="pb-3 text-right">Monto Original</th><th className="pb-3 text-right">Saldo Pendiente</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detalleDeuda.comprobantes.map(comp => (
                    <tr key={comp.id} className="hover:bg-gray-50">
                      <td className="py-3 text-gray-600">{comp.fecha_comprobante}</td>
                      <td className="py-3 font-medium">{comp.punto_venta}-{comp.numero_comprobante}</td>
                      <td className="py-3 text-right text-gray-500">{formatCurrencyConSigno(comp.total)}</td>
                      <td className="py-3 text-right font-bold text-gray-800">{formatCurrencyConSigno(comp.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button onClick={() => setDetalleDeuda(null)} className="px-6 py-2 bg-white border border-gray-300 rounded font-bold text-gray-600 hover:bg-gray-100">Cerrar (ESC)</button>
            </div>
          </div>
        </div>
      )}

      {/* NUEVO MODAL: DETALLE DEL DÍA DEL CALENDARIO */}
      {detalleDiaCalendario && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up">
               <div className="p-6 border-b bg-gray-50 flex justify-between items-start">
                   <div>
                      <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">📅 Detalle del Día</h3>
                      <p className="text-sm text-gray-500 capitalize">{new Date(detalleDiaCalendario.fecha + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                   </div>
                   <div className="text-right">
                      {detalleDiaCalendario.sumIn > 0 && <p className="text-sm font-bold text-green-600">+ {formatCurrencyConSigno(detalleDiaCalendario.sumIn)}</p>}
                      {detalleDiaCalendario.sumOut > 0 && <p className="text-sm font-bold text-red-600">- {formatCurrencyConSigno(detalleDiaCalendario.sumOut)}</p>}
                   </div>
               </div>
               <div className="p-6 overflow-y-auto max-h-[50vh]">
                   {detalleDiaCalendario.flows.length === 0 ? (
                      <p className="text-center text-gray-400 py-4">No hay movimientos registrados para esta fecha.</p>
                   ) : (
                      <div className="space-y-3">
                         {detalleDiaCalendario.flows.map(fl => (
                            <div key={fl.id} className="flex justify-between items-center border-b border-gray-100 pb-2">
                               <span className="text-sm text-gray-700 font-medium">{fl.descripcion}</span>
                               <span className={`text-sm font-bold ${fl.ingreso > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {fl.ingreso > 0 ? `+ ${formatCurrencyConSigno(fl.ingreso)}` : `- ${formatCurrencyConSigno(fl.egreso)}`}
                               </span>
                            </div>
                         ))}
                      </div>
                   )}
               </div>
               <div className="p-4 border-t bg-gray-50 flex justify-end">
                  <button onClick={() => setDetalleDiaCalendario(null)} className="px-6 py-2 bg-white border border-gray-300 rounded font-bold text-gray-600 hover:bg-gray-100 transition shadow-sm">Cerrar (ESC)</button>
               </div>
           </div>
        </div>
      )}
    </div>
  );
};

// --- COMPONENTE 3: RESULTADOS E IMPUESTOS (CON SIRCREB Y AUTÓNOMOS) ---
const ResultsDashboard = ({ facturas, movimientos, configImpuestos, setConfigImpuestos }) => {
  const [añoExpandido, setAñoExpandido] = useState(null);
  const [detalleModal, setDetalleModal] = useState(null); 
  const [subDetalle, setSubDetalle] = useState(null); 

  // ESC KEY PARA CERRAR AUDITORÍA
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setSubDetalle(prev => {
          if (prev) return null; // Cierra primero el subdetalle
          setDetalleModal(null); // Si no hay subdetalle, cierra el modal completo
          return prev;
        });
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const deduccionesTotal = (configImpuestos.mni || 0) + (configImpuestos.cargasFamilia || 0) + (configImpuestos.deduccionEspecial || 0);

  const datosAnuales = useMemo(() => {
    const años = {};

    const asegurarEstructura = (año, mes) => {
      if (!años[año]) años[año] = { 
        totales: { ventas:0, compras:0, cobros:0, pagos:0, ivaDeb:0, ivaCred:0, baseIIBB:0, retIva:0, retIIBB:0, retGan:0, deduccionesGenerales:0,
                   ventasItems: [], comprasItems: [], cobrosItems: [], pagosItems: [], retIvaItems: [], retIIBBItems: [], retGanItems: [], deduccionesGenItems: [] }, 
        meses: {} 
      };
      if (!años[año].meses[mes]) años[año].meses[mes] = { 
        ventas:0, compras:0, cobros:0, pagos:0, ivaDeb:0, ivaCred:0, baseIIBB:0, retIva:0, retIIBB:0, retGan:0, deduccionesGenerales:0,
        ventasItems: [], comprasItems: [], cobrosItems: [], pagosItems: [], retIvaItems: [], retIIBBItems: [], retGanItems: [], deduccionesGenItems: []
      };
    };
    
    facturas.forEach(f => {
      const mes = f.fecha_comprobante.substring(0, 7);
      const año = mes.substring(0, 4);
      asegurarEstructura(año, mes);
      
      const neto = Number(f.neto);
      const iva = Number(f.total) - neto;

      if (f.tipo === 'Venta') {
        const gravado = 100 - (Number(f.porcentaje_iibb_exento) || 0);
        const baseIIBB = (neto * gravado) / 100;
        
        años[año].totales.ventas += neto; años[año].meses[mes].ventas += neto;
        años[año].totales.ivaDeb += iva;  años[año].meses[mes].ivaDeb += iva;
        años[año].totales.baseIIBB += baseIIBB; años[año].meses[mes].baseIIBB += baseIIBB;
        años[año].totales.ventasItems.push(f); años[año].meses[mes].ventasItems.push(f);
      } else {
        años[año].totales.compras += neto; años[año].meses[mes].compras += neto;
        años[año].totales.ivaCred += iva;  años[año].meses[mes].ivaCred += iva;
        años[año].totales.comprasItems.push(f); años[año].meses[mes].comprasItems.push(f);
      }
    });

    movimientos.forEach(mov => {
      const monto = Number(mov.importe);
      
      const mesFin = mov.fecha_efectiva.substring(0, 7);
      const añoFin = mesFin.substring(0, 4);
      asegurarEstructura(añoFin, mesFin);

      let esIngreso = false; let esEgreso = false;
      let descFin = mov.nota || mov.tipo_movimiento.replace(/_/g, ' ').toUpperCase();
      
      if (['saldo_inicial', 'inversion_rescate', 'saldo_inicial_inversion', 'interes_inversion'].includes(mov.tipo_movimiento)) esIngreso = true;
      else if (['inversion_ingreso', 'pago_impuesto', 'pago_servicio', 'gasto_vario', 'pago_autonomos', 'retencion_sircreb', 'vencimiento_tarjeta', 'retencion_ley_25413'].includes(mov.tipo_movimiento)) esEgreso = true;
      else if (mov.tipo_movimiento === 'factura') {
        const f = facturas.find(x => x.id === mov.factura_id);
        if (f) { 
           if (f.tipo === 'Venta') esIngreso = true; else esEgreso = true; 
           descFin = `FC ${f.entidad} ${mov.nota ? `(${mov.nota})` : ''}`;
        }
      }
      
      const movAnotado = { ...mov, descripcion_calculada: descFin };

      if (esIngreso) { años[añoFin].totales.cobros += monto; años[añoFin].meses[mesFin].cobros += monto; años[añoFin].totales.cobrosItems.push(movAnotado); años[añoFin].meses[mesFin].cobrosItems.push(movAnotado); }
      if (esEgreso) { años[añoFin].totales.pagos += monto; años[añoFin].meses[mesFin].pagos += monto; años[añoFin].totales.pagosItems.push(movAnotado); años[añoFin].meses[mesFin].pagosItems.push(movAnotado); }

      // LOGICA DE IMPUESTOS
      if (mov.fecha_pago) {
        const mesFis = mov.fecha_pago.substring(0, 7);
        const añoFis = mesFis.substring(0, 4);
        asegurarEstructura(añoFis, mesFis);
        
        if (mov.ret_iva > 0) { años[añoFis].totales.retIva += Number(mov.ret_iva); años[añoFis].meses[mesFis].retIva += Number(mov.ret_iva); años[añoFis].totales.retIvaItems.push({...mov, importe_aplicado: mov.ret_iva, descripcion_calculada: descFin}); años[añoFis].meses[mesFis].retIvaItems.push({...mov, importe_aplicado: mov.ret_iva, descripcion_calculada: descFin}); }
        
        // Sumar Retenciones clásicas de Ganancias y el Impuesto Ley 25.413
        if (mov.ret_ganancias > 0) { años[añoFis].totales.retGan += Number(mov.ret_ganancias); años[añoFis].meses[mesFis].retGan += Number(mov.ret_ganancias); años[añoFis].totales.retGanItems.push({...mov, importe_aplicado: mov.ret_ganancias, descripcion_calculada: descFin}); años[añoFis].meses[mesFis].retGanItems.push({...mov, importe_aplicado: mov.ret_ganancias, descripcion_calculada: descFin}); }
        if (mov.tipo_movimiento === 'retencion_ley_25413') { años[añoFis].totales.retGan += monto; años[añoFis].meses[mesFis].retGan += monto; años[añoFis].totales.retGanItems.push({...mov, importe_aplicado: monto, descripcion_calculada: 'Ley 25.413: ' + descFin}); años[añoFis].meses[mesFis].retGanItems.push({...mov, importe_aplicado: monto, descripcion_calculada: 'Ley 25.413: ' + descFin}); }
        
        // Sumar Retenciones clásicas de IIBB y SIRCREB
        if (mov.ret_iibb > 0) { años[añoFis].totales.retIIBB += Number(mov.ret_iibb); años[añoFis].meses[mesFis].retIIBB += Number(mov.ret_iibb); años[añoFis].totales.retIIBBItems.push({...mov, importe_aplicado: mov.ret_iibb, descripcion_calculada: descFin}); años[añoFis].meses[mesFis].retIIBBItems.push({...mov, importe_aplicado: mov.ret_iibb, descripcion_calculada: descFin}); }
        if (mov.tipo_movimiento === 'retencion_sircreb') { años[añoFis].totales.retIIBB += monto; años[añoFis].meses[mesFis].retIIBB += monto; años[añoFis].totales.retIIBBItems.push({...mov, importe_aplicado: monto, descripcion_calculada: 'SIRCREB: ' + descFin}); años[añoFis].meses[mesFis].retIIBBItems.push({...mov, importe_aplicado: monto, descripcion_calculada: 'SIRCREB: ' + descFin}); }
        
        // Sumar Autónomos a las Deducciones Generales
        if (mov.tipo_movimiento === 'pago_autonomos') { años[añoFis].totales.deduccionesGenerales += monto; años[añoFis].meses[mesFis].deduccionesGenerales += monto; años[añoFis].totales.deduccionesGenItems.push({...mov, importe_aplicado: monto, descripcion_calculada: 'Autónomos: ' + descFin}); años[añoFis].meses[mesFis].deduccionesGenItems.push({...mov, importe_aplicado: monto, descripcion_calculada: 'Autónomos: ' + descFin}); }
      }
    });

    const resultadoArr = Object.entries(años).sort((a, b) => b[0].localeCompare(a[0])).map(([año, data]) => {
      const resEcoAnual = data.totales.ventas - data.totales.compras;
      const gananciaNetaGeneralAnual = Math.max(0, resEcoAnual - data.totales.deduccionesGenerales);
      const baseImpGanAnual = Math.max(0, gananciaNetaGeneralAnual - deduccionesTotal);
      
      const calculoGanAnual = calcularGananciaProgresiva(baseImpGanAnual, configImpuestos.tablaganancias);
      data.totales.calculoProgresivoDetalle = calculoGanAnual;

      const mesesOrdenados = Object.entries(data.meses).sort((a, b) => b[0].localeCompare(a[0])).map(([mes, d]) => {
         const resEcoMes = d.ventas - d.compras;
         const gananciaNetaGeneralMes = Math.max(0, resEcoMes - d.deduccionesGenerales);
         const baseImpGanMes = Math.max(0, gananciaNetaGeneralMes - deduccionesTotal);
         d.calculoProgresivoDetalle = calcularGananciaProgresiva(baseImpGanMes, configImpuestos.tablaganancias);
         return [mes, d];
      });

      return { año, totales: data.totales, meses: mesesOrdenados };
    });

    return resultadoArr;
  }, [facturas, movimientos, deduccionesTotal, configImpuestos.tablaganancias]);

  const toggleAño = (año) => setAñoExpandido(añoExpandido === año ? null : año);

  const renderListaSubDetalle = () => (
    <div className="animate-fade-in">
       <div className="flex justify-between items-center bg-gray-100 p-3 rounded-t-lg border-b">
         <h4 className="font-bold text-gray-800 text-sm">🔍 {subDetalle.titulo}</h4>
         <button onClick={() => setSubDetalle(null)} className="text-xs bg-white border border-gray-300 px-3 py-1 rounded shadow-sm hover:bg-gray-50">← Volver al cálculo</button>
       </div>
       <div className="p-4 overflow-y-auto max-h-[50vh]">
         <table className="w-full text-xs text-left">
           <thead className="text-gray-400 border-b uppercase">
             <tr><th className="pb-2">Fecha</th><th className="pb-2">Detalle</th><th className="pb-2 text-right">Importe</th></tr>
           </thead>
           <tbody className="divide-y">
             {subDetalle.items.map((it, idx) => (
               <tr key={idx} className="hover:bg-gray-50">
                 {subDetalle.tipo === 'facturas' ? (
                   <>
                     <td className="py-2 text-gray-500 whitespace-nowrap">{it.fecha_comprobante}</td>
                     <td className="py-2 font-medium text-gray-700">{it.entidad} <span className="text-[9px] text-gray-400 ml-1">FC {it.punto_venta}-{it.numero_comprobante}</span></td>
                     <td className="py-2 text-right font-bold">${formatCurrency(subDetalle.mostrarIva ? (it.total - it.neto) : it.neto)}</td>
                   </>
                 ) : (
                   <>
                     <td className="py-2 text-gray-500 whitespace-nowrap">{it.fecha_efectiva || it.fecha_pago}</td>
                     <td className="py-2 font-medium text-gray-700">{it.descripcion_calculada}</td>
                     <td className="py-2 text-right font-bold text-blue-700">${formatCurrency(it.importe_aplicado || it.importe)}</td>
                   </>
                 )}
               </tr>
             ))}
             {subDetalle.items.length === 0 && <tr><td colSpan="3" className="text-center py-6 text-gray-400">No hay registros que compongan este valor.</td></tr>}
           </tbody>
         </table>
       </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center gap-4">
        <h3 className="font-bold text-gray-800">⚙️ Configuración Fiscal</h3>
        <div className="flex gap-4 items-center">
           <div className="flex items-center gap-2"><label className="text-xs font-bold text-gray-500">Alícuota IIBB %</label><input type="number" step="0.1" value={configImpuestos.iibb} onChange={e => setConfigImpuestos({...configImpuestos, iibb: Number(e.target.value)})} className="w-16 p-1 border rounded text-right font-bold" /></div>
           <button onClick={() => setDetalleModal({tipo: 'ConfigTablaGanancias'})} className="bg-gray-100 text-gray-700 px-4 py-2 rounded shadow-sm text-sm font-bold hover:bg-gray-200 transition flex items-center gap-2">📊 Editar Tabla Ganancias</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
           <h3 className="font-bold text-gray-800">🗓️ Resumen Anual y Detalle Mensual</h3>
           <p className="text-xs text-gray-500">Click en cualquier número (azul o verde) para ver detalle y comprobantes.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center">
            <thead className="bg-gray-800 text-white uppercase text-xs">
              <tr>
                <th className="p-3 text-left border-r border-gray-700 w-32">Periodo</th>
                <th className="p-3 text-gray-300">Res. Económico<br/><span className="text-[9px]">(Ventas - Compras)</span></th>
                <th className="p-3 text-gray-300 border-r border-gray-700">Res. Financiero<br/><span className="text-[9px]">(Cobros - Pagos)</span></th>
                <th className="p-3">IVA (A pagar)<br/><span className="text-[9px]">🔍 CLICK PARA DETALLE</span></th>
                <th className="p-3">IIBB (A pagar)<br/><span className="text-[9px]">🔍 CLICK PARA DETALLE</span></th>
                <th className="p-3 text-green-400">Prov. Ganancias<br/><span className="text-[9px]">🔍 CLICK PARA DETALLE</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {datosAnuales.map((item) => {
                const { año, totales, meses } = item;
                
                const resEcoAnual = totales.ventas - totales.compras;
                const resFinAnual = totales.cobros - totales.pagos;
                
                const saldoIvaAnual = totales.ivaDeb - totales.ivaCred;
                const aPagarIvaAnual = saldoIvaAnual - totales.retIva; 
                
                const impuestoIIBBAnual = (totales.baseIIBB * configImpuestos.iibb) / 100;
                const aPagarIIBBAnual = impuestoIIBBAnual - totales.retIIBB;
                
                const aPagarGanAnual = totales.calculoProgresivoDetalle.impuestoDeterminado - totales.retGan;
                
                const isExpanded = añoExpandido === año;

                return (
                  <React.Fragment key={año}>
                    <tr className={`transition ${isExpanded ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'}`}>
                      <td className="p-3 text-left border-r font-bold text-lg text-blue-900 flex items-center gap-2 cursor-pointer" onClick={() => toggleAño(año)}>
                        {isExpanded ? '🔽' : '▶️'} Año {año}
                      </td>
                      <td className={`p-3 font-bold text-lg cursor-pointer underline decoration-dotted transition hover:bg-blue-100 ${resEcoAnual >= 0 ? 'text-green-600' : 'text-red-600'}`} onClick={() => setDetalleModal({tipo: 'ResEconómico', periodo: `Año ${año}`, data: totales})}>{formatCurrencyConSigno(resEcoAnual)}</td>
                      <td className={`p-3 font-bold text-lg border-r cursor-pointer underline decoration-dotted transition hover:bg-blue-100 ${resFinAnual >= 0 ? 'text-blue-600' : 'text-orange-600'}`} onClick={() => setDetalleModal({tipo: 'ResFinanciero', periodo: `Año ${año}`, data: totales})}>{formatCurrencyConSigno(resFinAnual)}</td>
                      
                      <td className={`p-3 font-bold cursor-pointer transition underline decoration-dotted hover:bg-blue-100 ${aPagarIvaAnual < 0 ? 'text-green-600' : 'text-blue-800'}`} onClick={() => setDetalleModal({tipo: 'IVA', periodo: `Año ${año}`, data: totales})}>{formatCurrencyConSigno(aPagarIvaAnual)}</td>
                      <td className={`p-3 font-bold cursor-pointer transition underline decoration-dotted hover:bg-blue-100 ${aPagarIIBBAnual < 0 ? 'text-green-600' : 'text-blue-800'}`} onClick={() => setDetalleModal({tipo: 'IIBB', periodo: `Año ${año}`, data: totales})}>{formatCurrencyConSigno(aPagarIIBBAnual)}</td>
                      <td className={`p-3 font-bold text-xl bg-green-50 border-l-4 border-green-500 cursor-pointer transition underline decoration-dotted hover:bg-green-200 ${aPagarGanAnual < 0 ? 'text-green-600' : 'text-green-800'}`} onClick={() => setDetalleModal({tipo: 'Ganancias', periodo: `Año ${año}`, data: totales})}>{formatCurrencyConSigno(aPagarGanAnual)}</td>
                    </tr>

                    {isExpanded && meses.map(([mes, d]) => {
                       const resEcoMes = d.ventas - d.compras;
                       const resFinMes = d.cobros - d.pagos;
                       
                       const aPagarIvaMes = (d.ivaDeb - d.ivaCred) - d.retIva;
                       const aPagarIIBBMes = ((d.baseIIBB * configImpuestos.iibb) / 100) - d.retIIBB;
                       const aPagarGanMes = d.calculoProgresivoDetalle.impuestoDeterminado - d.retGan;
                       
                       return (
                         <tr key={mes} className="bg-gray-100 text-sm border-b border-gray-200">
                           <td className="p-2 text-left pl-8 border-r text-gray-600 font-medium">↳ {mes}</td>
                           <td className={`p-2 cursor-pointer underline decoration-dotted hover:bg-gray-200 ${resEcoMes >= 0 ? 'text-green-600' : 'text-red-500'}`} onClick={() => setDetalleModal({tipo: 'ResEconómico', periodo: mes, data: d})}>{formatCurrencyConSigno(resEcoMes)}</td>
                           <td className={`p-2 border-r cursor-pointer underline decoration-dotted hover:bg-gray-200 ${resFinMes >= 0 ? 'text-blue-600' : 'text-orange-500'}`} onClick={() => setDetalleModal({tipo: 'ResFinanciero', periodo: mes, data: d})}>{formatCurrencyConSigno(resFinMes)}</td>
                           
                           <td className={`p-2 font-bold cursor-pointer underline decoration-dotted hover:bg-blue-200 ${aPagarIvaMes < 0 ? 'text-green-600' : 'text-blue-800'}`} onClick={() => setDetalleModal({tipo: 'IVA', periodo: mes, data: d})}>{formatCurrencyConSigno(aPagarIvaMes)}</td>
                           <td className={`p-2 font-bold cursor-pointer underline decoration-dotted hover:bg-blue-200 ${aPagarIIBBMes < 0 ? 'text-green-600' : 'text-blue-800'}`} onClick={() => setDetalleModal({tipo: 'IIBB', periodo: mes, data: d})}>{formatCurrencyConSigno(aPagarIIBBMes)}</td>
                           <td className={`p-2 font-bold cursor-pointer underline decoration-dotted hover:bg-green-200 ${aPagarGanMes < 0 ? 'text-green-600' : 'text-green-800'}`} onClick={() => setDetalleModal({tipo: 'Ganancias', periodo: mes, data: d})}>{formatCurrencyConSigno(aPagarGanMes)}</td>
                         </tr>
                       );
                    })}
                  </React.Fragment>
                );
              })}
              {datosAnuales.length === 0 && <tr><td colSpan="6" className="p-8 text-gray-400">Sin datos registrados para calcular impuestos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* RENDERIZADO CONDICIONAL DE MODALES DE DETALLE O EDICIÓN DE TABLA */}
      {detalleModal && detalleModal.tipo === 'ConfigTablaGanancias' ? (
        <ModalEditTablaGanancias 
           tabla={configImpuestos.tablaganancias}
           onSave={(nuevaTabla) => { setConfigImpuestos({...configImpuestos, tablaganancias: nuevaTabla}); setDetalleModal(null); }}
           onClose={() => setDetalleModal(null)}
        />
      ) : detalleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up">
             <div className="p-6 border-b flex justify-between items-start bg-gray-50">
               <div>
                  <h3 className="text-xl font-bold text-gray-800">Auditoría: {detalleModal.tipo}</h3>
                  <p className="text-sm text-gray-500">Período: <span className="font-bold">{detalleModal.periodo}</span></p>
               </div>
             </div>
             
             {subDetalle ? renderListaSubDetalle() : (
               <div className="p-6 space-y-4 text-sm text-gray-700">
                 {detalleModal.tipo === 'ResEconómico' && (
                    <>
                      <div className="flex justify-between border-b border-gray-100 pb-2 cursor-pointer hover:bg-gray-100 p-1 rounded transition" onClick={() => setSubDetalle({titulo: 'Ventas (Neto)', tipo: 'facturas', mostrarIva: false, items: detalleModal.data.ventasItems})}><span className="underline decoration-dotted">Total Ventas (Neto):</span> <span className="font-bold text-green-600">+ {formatCurrencyConSigno(detalleModal.data.ventas)}</span></div>
                      <div className="flex justify-between border-b border-gray-100 pb-2 cursor-pointer hover:bg-gray-100 p-1 rounded transition" onClick={() => setSubDetalle({titulo: 'Compras (Neto)', tipo: 'facturas', mostrarIva: false, items: detalleModal.data.comprasItems})}><span className="underline decoration-dotted">Total Compras (Neto):</span> <span className="font-bold text-red-600">- {formatCurrencyConSigno(detalleModal.data.compras)}</span></div>
                      <div className="flex justify-between pt-2 text-lg"><span>Resultado Económico:</span> <span className={`font-bold ${detalleModal.data.ventas - detalleModal.data.compras >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrencyConSigno(detalleModal.data.ventas - detalleModal.data.compras)}</span></div>
                    </>
                 )}

                 {detalleModal.tipo === 'ResFinanciero' && (
                    <>
                      <div className="flex justify-between border-b border-gray-100 pb-2 cursor-pointer hover:bg-gray-100 p-1 rounded transition" onClick={() => setSubDetalle({titulo: 'Cobros / Ingresos', tipo: 'movimientos', items: detalleModal.data.cobrosItems})}><span className="underline decoration-dotted">Total Ingresos:</span> <span className="font-bold text-blue-600">+ {formatCurrencyConSigno(detalleModal.data.cobros)}</span></div>
                      <div className="flex justify-between border-b border-gray-100 pb-2 cursor-pointer hover:bg-gray-100 p-1 rounded transition" onClick={() => setSubDetalle({titulo: 'Pagos / Egresos', tipo: 'movimientos', items: detalleModal.data.pagosItems})}><span className="underline decoration-dotted">Total Egresos:</span> <span className="font-bold text-orange-600">- {formatCurrencyConSigno(detalleModal.data.pagos)}</span></div>
                      <div className="flex justify-between pt-2 text-lg"><span>Resultado Financiero:</span> <span className={`font-bold ${detalleModal.data.cobros - detalleModal.data.pagos >= 0 ? 'text-blue-800' : 'text-orange-800'}`}>{formatCurrencyConSigno(detalleModal.data.cobros - detalleModal.data.pagos)}</span></div>
                    </>
                 )}

                 {detalleModal.tipo === 'IVA' && (
                    <>
                      <div className="flex justify-between border-b border-gray-100 pb-2 cursor-pointer hover:bg-blue-50 p-1 rounded transition" onClick={() => setSubDetalle({titulo: 'Débito Fiscal (IVA Ventas)', tipo: 'facturas', mostrarIva: true, items: detalleModal.data.ventasItems})}><span className="underline decoration-dotted text-blue-700">Débito Fiscal (Ventas):</span> <span className="font-bold text-gray-800">{formatCurrencyConSigno(detalleModal.data.ivaDeb)}</span></div>
                      <div className="flex justify-between border-b border-gray-100 pb-2 cursor-pointer hover:bg-blue-50 p-1 rounded transition" onClick={() => setSubDetalle({titulo: 'Crédito Fiscal (IVA Compras)', tipo: 'facturas', mostrarIva: true, items: detalleModal.data.comprasItems})}><span className="underline decoration-dotted text-blue-700">Crédito Fiscal (Compras):</span> <span className="font-bold text-red-600">- {formatCurrencyConSigno(detalleModal.data.ivaCred)}</span></div>
                      <div className="flex justify-between border-b border-gray-200 pb-2 bg-gray-50 p-1 rounded"><span>Saldo Técnico:</span> <span className="font-bold text-gray-800">{formatCurrencyConSigno(detalleModal.data.ivaDeb - detalleModal.data.ivaCred)}</span></div>
                      <div className="flex justify-between border-b border-gray-100 pb-2 mt-2 cursor-pointer hover:bg-orange-50 p-1 rounded transition" onClick={() => setSubDetalle({titulo: 'Retenciones de IVA', tipo: 'movimientos', items: detalleModal.data.retIvaItems})}><span className="underline decoration-dotted text-orange-700">Retenciones Sufridas:</span> <span className="font-bold text-orange-600">- {formatCurrencyConSigno(detalleModal.data.retIva)}</span></div>
                      <div className="flex justify-between pt-2 text-lg"><span>Saldo Final (A pagar / A favor):</span> <span className={`font-bold ${(detalleModal.data.ivaDeb - detalleModal.data.ivaCred) - detalleModal.data.retIva < 0 ? 'text-green-600' : 'text-blue-800'}`}>{formatCurrencyConSigno((detalleModal.data.ivaDeb - detalleModal.data.ivaCred) - detalleModal.data.retIva)}</span></div>
                    </>
                 )}

                 {detalleModal.tipo === 'IIBB' && (
                    <>
                      <div className="flex justify-between border-b border-gray-100 pb-2 cursor-pointer hover:bg-blue-50 p-1 rounded transition" onClick={() => setSubDetalle({titulo: 'Ventas (Base Imponible IIBB)', tipo: 'facturas', mostrarIva: false, items: detalleModal.data.ventasItems})}><span className="underline decoration-dotted text-blue-700">Ventas Gravadas (Base Imp.):</span> <span className="font-bold text-gray-800">{formatCurrencyConSigno(detalleModal.data.baseIIBB)}</span></div>
                      <div className="flex justify-between border-b border-gray-100 pb-2"><span>Alícuota Aplicada:</span> <span className="font-bold text-gray-600">{configImpuestos.iibb}%</span></div>
                      <div className="flex justify-between border-b border-gray-200 pb-2 bg-gray-50 p-1 rounded"><span>Impuesto Determinado:</span> <span className="font-bold text-gray-800">{formatCurrencyConSigno((detalleModal.data.baseIIBB * configImpuestos.iibb) / 100)}</span></div>
                      <div className="flex justify-between border-b border-gray-100 pb-2 mt-2 cursor-pointer hover:bg-orange-50 p-1 rounded transition" onClick={() => setSubDetalle({titulo: 'Retenciones de IIBB (Inc. SIRCREB)', tipo: 'movimientos', items: detalleModal.data.retIIBBItems})}><span className="underline decoration-dotted text-orange-700">Retenciones Sufridas:</span> <span className="font-bold text-orange-600">- {formatCurrencyConSigno(detalleModal.data.retIIBB)}</span></div>
                      <div className="flex justify-between pt-2 text-lg"><span>Saldo Final (A pagar / A favor):</span> <span className={`font-bold ${((detalleModal.data.baseIIBB * configImpuestos.iibb) / 100) - detalleModal.data.retIIBB < 0 ? 'text-green-600' : 'text-blue-800'}`}>{formatCurrencyConSigno(((detalleModal.data.baseIIBB * configImpuestos.iibb) / 100) - detalleModal.data.retIIBB)}</span></div>
                    </>
                 )}

                 {detalleModal.tipo === 'Ganancias' && (
                    <>
                      <div className="flex justify-between border-b border-gray-100 pb-2 cursor-pointer hover:bg-gray-100 p-1 rounded transition" onClick={() => setDetalleModal({...detalleModal, tipo: 'ResEconómico'})}><span className="underline decoration-dotted text-blue-700">Res. Económico Bruto:</span> <span className="font-bold text-gray-800">{formatCurrencyConSigno(detalleModal.data.ventas - detalleModal.data.compras)}</span></div>
                      
                      <div className="flex justify-between border-b border-gray-100 pb-2 cursor-pointer hover:bg-orange-50 p-1 rounded transition mt-1" onClick={() => setSubDetalle({titulo: 'Deducciones Generales (Autónomos)', tipo: 'movimientos', items: detalleModal.data.deduccionesGenItems})}><span className="underline decoration-dotted text-orange-800">Deducciones Generales (Autónomos):</span> <span className="font-bold text-orange-600">- {formatCurrencyConSigno(detalleModal.data.deduccionesGenerales)}</span></div>
                      <div className="flex justify-between border-b border-gray-200 pb-2 bg-gray-50 p-1 rounded"><span>Ganancia Neta General:</span> <span className="font-bold text-gray-800">{formatCurrencyConSigno(Math.max(0, (detalleModal.data.ventas - detalleModal.data.compras) - detalleModal.data.deduccionesGenerales))}</span></div>

                      <div className="bg-green-50 p-3 rounded-lg border border-green-200 space-y-3 my-3 shadow-inner">
                         <p className="font-bold text-xs text-green-800 uppercase border-b border-green-200 pb-1">Deducciones Personales</p>
                         <div className="flex justify-between items-center">
                           <span className="text-xs text-green-900 font-medium">Mínimo No Imponible:</span>
                           <input type="number" className="p-1 border border-green-300 rounded w-28 text-right text-xs bg-white font-bold" value={configImpuestos.mni || ''} onChange={e => setConfigImpuestos({...configImpuestos, mni: Number(e.target.value)})} placeholder="0.00" />
                         </div>
                         <div className="flex justify-between items-center">
                           <span className="text-xs text-green-900 font-medium">Cargas de Familia:</span>
                           <input type="number" className="p-1 border border-green-300 rounded w-28 text-right text-xs bg-white font-bold" value={configImpuestos.cargasFamilia || ''} onChange={e => setConfigImpuestos({...configImpuestos, cargasFamilia: Number(e.target.value)})} placeholder="0.00" />
                         </div>
                         <div className="flex justify-between items-center">
                           <span className="text-xs text-green-900 font-medium">Deducción Especial:</span>
                           <input type="number" className="p-1 border border-green-300 rounded w-28 text-right text-xs bg-white font-bold" value={configImpuestos.deduccionEspecial || ''} onChange={e => setConfigImpuestos({...configImpuestos, deduccionEspecial: Number(e.target.value)})} placeholder="0.00" />
                         </div>
                      </div>

                      <div className="flex justify-between border-b border-gray-200 pb-2 bg-gray-50 p-1 rounded"><span>Base Imponible Neta:</span> <span className="font-bold text-gray-800">{formatCurrencyConSigno(Math.max(0, (Math.max(0, (detalleModal.data.ventas - detalleModal.data.compras) - detalleModal.data.deduccionesGenerales)) - deduccionesTotal))}</span></div>
                      
                      <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 space-y-2 my-4 shadow-sm">
                         <p className="font-bold text-xs text-blue-900 uppercase border-b border-blue-200 pb-1 mb-2">Cálculo Progresivo (Art. 94)</p>
                         <div className="flex justify-between border-b border-blue-100 pb-1 text-xs"><span>1. Componente Fijo:</span> <span className="font-bold text-gray-800">{formatCurrencyConSigno(detalleModal.data.calculoProgresivoDetalle?.fijo)}</span></div>
                         <div className="flex justify-between border-b border-blue-100 pb-1 text-xs"><span>2. Excedente aplicado:</span> <span className="text-gray-600 font-bold">{formatCurrencyConSigno(detalleModal.data.calculoProgresivoDetalle?.excedente)}</span></div>
                         <div className="flex justify-between border-b border-blue-100 pb-1 text-xs"><span>3. Alícuota Variable ({detalleModal.data.calculoProgresivoDetalle?.tasaVariablePercent?.toFixed(1)}%):</span> <span className="font-bold text-blue-800">+ {formatCurrencyConSigno(detalleModal.data.calculoProgresivoDetalle?.variable)}</span></div>
                         <div className="flex justify-between pt-1 text-sm font-medium bg-white p-1 rounded"><span>Imp. Determinado Progresivo (1 + 3):</span> <span className="font-bold text-gray-800">{formatCurrencyConSigno(detalleModal.data.calculoProgresivoDetalle?.impuestoDeterminado)}</span></div>
                      </div>

                      <div className="flex justify-between border-b border-gray-100 pb-2 mt-2 cursor-pointer hover:bg-orange-50 p-1 rounded transition" onClick={() => setSubDetalle({titulo: 'Retenciones de Ganancias y Ley 25.413', tipo: 'movimientos', items: detalleModal.data.retGanItems})}><span className="underline decoration-dotted text-orange-700">Retenciones Sufridas (inc. Cheque):</span> <span className="font-bold text-orange-600">- {formatCurrencyConSigno(detalleModal.data.retGan)}</span></div>
                      <div className="flex justify-between pt-2 text-lg"><span>Saldo Final (A pagar / A favor):</span> <span className={`font-bold ${detalleModal.data.calculoProgresivoDetalle?.impuestoDeterminado - detalleModal.data.retGan < 0 ? 'text-green-600' : 'text-green-800'}`}>{formatCurrencyConSigno(detalleModal.data.calculoProgresivoDetalle?.impuestoDeterminado - detalleModal.data.retGan)}</span></div>
                    </>
                 )}
               </div>
             )}
             
             {!subDetalle && (
               <div className="p-4 border-t bg-gray-50 flex justify-end">
                  <button onClick={() => setDetalleModal(null)} className="px-6 py-2 bg-white border border-gray-300 rounded font-bold text-gray-600 hover:bg-gray-100 transition shadow-sm">Cerrar (ESC)</button>
               </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
};


// --- NUEVO COMPONENTE: EDITOR DE TABLA GANANCIAS ---
const ModalEditTablaGanancias = ({ tabla, onSave, onClose }) => {
  const [tablaLocal, setTablaLocal] = useState([...tabla]);

  // ESC KEY PARA CERRAR EDICION TABLA
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleChangeRaw = (index, field, value) => {
    const nuevaTabla = [...tablaLocal];
    let numVal = Number(value);
    if (field === 'limiteSuperior' && value === 'Infinity') numVal = Infinity;
    nuevaTabla[index] = { ...nuevaTabla[index], [field]: numVal };
    setTablaLocal(nuevaTabla);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden animate-fade-in-up flex flex-col">
         <div className="p-6 border-b flex justify-between items-start bg-gray-50">
           <div>
              <h3 className="text-xl font-bold text-gray-800">📊 Configuración de Escala de Ganancias (Art. 94)</h3>
              <p className="text-sm text-gray-500">Edita los valores de la tabla oficial para el cálculo progresivo real.</p>
           </div>
         </div>
         
         <div className="p-6 overflow-y-auto flex-grow space-y-3">
           <div className="grid grid-cols-5 gap-2 text-xs font-bold text-gray-500 uppercase pb-2 border-b text-center">
             <span>Concepto</span>
             <span>Pagarán (Fijo $)</span>
             <span>Más el % Variable</span>
             <span>Sobre excedente $</span>
             <span>Tramo Imponible (Inferior - Superior)</span>
           </div>

           {tablaLocal.map((tramo, index) => {
             const esUltimo = index === tablaLocal.length - 1;
             const tasaPercent = tramo.alicuotaVariable * 100;

             return (
               <div key={index} className="grid grid-cols-5 gap-2 items-center bg-gray-50 p-3 rounded-lg border border-gray-100 hover:bg-gray-100 transition shadow-inner">
                 <span className="font-bold text-sm text-gray-900 whitespace-nowrap">Tramo {index + 1}</span>
                 <input type="number" value={tramo.fijoPagar} onChange={e => handleChangeRaw(index, 'fijoPagar', e.target.value)} className="p-2 border rounded font-bold text-right" placeholder="0.00" />
                 <div className="flex items-center gap-1"><input type="number" step="1" value={tasaPercent} onChange={e => handleChangeRaw(index, 'alicuotaVariable', Number(e.target.value)/100)} className="w-16 p-2 border rounded font-bold text-right text-sm" placeholder="5" /> <span className="text-sm">%</span></div>
                 <input type="number" value={tramo.sobreExcedente} onChange={e => handleChangeRaw(index, 'sobreExcedente', e.target.value)} className="p-2 border rounded font-bold text-right" placeholder="0.00" />
                 <div className="flex gap-1 items-center text-xs justify-end"><input type="number" value={tramo.limiteInferior} onChange={e => handleChangeRaw(index, 'limiteInferior', e.target.value)} className="w-24 p-1 border rounded text-right" /> <span>a</span> {esUltimo ? <span className="font-bold text-gray-600 w-24 text-center">En adelante</span> : <input type="number" value={tramo.limiteSuperior} onChange={e => handleChangeRaw(index, 'limiteSuperior', e.target.value)} className="w-24 p-1 border rounded text-right" />}</div>
               </div>
             );
           })}
         </div>
         
         <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
            <button onClick={onClose} className="px-6 py-2 bg-white border border-gray-300 rounded font-bold text-gray-600 hover:bg-gray-100 transition shadow-sm text-sm">Cerrar sin guardar (ESC)</button>
            <button onClick={() => onSave(tablaLocal)} className="px-8 py-2 bg-green-600 text-white rounded font-bold hover:bg-green-700 transition shadow-sm text-sm">Guardar Cambios Anuales</button>
         </div>
      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPAL ---
const InvoiceManager = ({ session }) => {
  const [activeTab, setActiveTab] = useState('gestion'); 
  const [facturas, setFacturas] = useState([]);
  const [movimientos, setMovimientos] = useState([]); 
  const [empresas, setEmpresas] = useState([]);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState('');
  const [modoNuevaEmpresa, setModoNuevaEmpresa] = useState(false);
  const [datosEmpresa, setDatosEmpresa] = useState({ cuit: '', razonSocial: '' });
  const [loading, setLoading] = useState(false);
  
  const [configImpuestos, setConfigImpuestos] = useState({ 
    iibb: 4.0, 
    mni: 0, 
    cargasFamilia: 0, 
    deduccionEspecial: 0,
    tablaganancias: escalaGanancias2025Inicial
  });
  
  const [entidadesFrecuentes, setEntidadesFrecuentes] = useState([]);
  const [modalCobro, setModalCobro] = useState(null);
  const [movimientoEdicion, setMovimientoEdicion] = useState(null);
  const [modalInversion, setModalInversion] = useState(false);
  
  const [filtroTipoFactura, setFiltroTipoFactura] = useState('Venta');
  const [filtroTextoFactura, setFiltroTextoFactura] = useState('');

  // ESC KEY PARA CERRAR MODALES PRINCIPALES
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setModalCobro(null);
        setModalInversion(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const [formData, setFormData] = useState({ 
    tipo: 'Venta', fecha: new Date().toISOString().split('T')[0], 
    entidad: '', cuitEntidad: '', puntoVenta: '', numero: '', 
    neto: 0, alicuotaIva: 21, porcentajeExentoIIBB: 0, total: 0 
  });
  const [formCobro, setFormCobro] = useState({ 
    fechaEmision: new Date().toISOString().split('T')[0], fechaEfectiva: new Date().toISOString().split('T')[0], 
    importe: 0, retGanancias: 0, retIva: 0, retIibb: 0, nota: '' 
  });
  const [formInversion, setFormInversion] = useState({
    id: null, tipo: 'saldo_inicial', fecha: new Date().toISOString().split('T')[0], importe: 0, descripcion: ''
  });

  useEffect(() => { 
    fetchEmpresas(); 
    fetchEntidadesFrecuentes(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (empresaSeleccionada && empresaSeleccionada !== 'nueva') {
      const empresa = empresas.find(e => e.id === empresaSeleccionada);
      if (empresa) {
        setDatosEmpresa({ cuit: empresa.cuit, razonSocial: empresa.razon_social });
        fetchDataCompleta(empresa.cuit);
      }
    } else { setFacturas([]); setMovimientos([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaSeleccionada, empresas]);

  useEffect(() => {
    const iva = (Number(formData.neto) * Number(formData.alicuotaIva)) / 100;
    setFormData(prev => ({ ...prev, total: Number(formData.neto) + iva }));
  }, [formData.neto, formData.alicuotaIva]);

  const fetchEmpresas = async () => { const { data } = await supabase.from('empresas').select('*').eq('user_id', session.user.id); if (data) setEmpresas(data); };
  const fetchEntidadesFrecuentes = async () => { const { data } = await supabase.from('entidades_frecuentes').select('*').eq('user_id', session.user.id); if (data) setEntidadesFrecuentes(data); };
  
  const fetchDataCompleta = async (cuit) => {
    const { data: facturasData } = await supabase.from('facturas').select(`*, movimientos_caja(*)`).eq('cuit_empresa', cuit).order('fecha_comprobante', { ascending: false });
    const { data: movsSueltos } = await supabase.from('movimientos_caja').select('*').is('factura_id', null).eq('user_id', session.user.id);
    let todosLosMovimientos = movsSueltos || [];
    if (facturasData) {
      const procesadas = facturasData.map(f => {
        const totalPagado = f.movimientos_caja.reduce((acc, mov) => {
          todosLosMovimientos.push({ ...mov, factura_id: f.id, tipo_movimiento: 'factura' }); 
          return acc + mov.importe + (mov.ret_ganancias || 0) + (mov.ret_iva || 0) + (mov.ret_iibb || 0);
        }, 0);
        return { ...f, pagado: totalPagado, saldo: f.total - totalPagado, cuit_entidad: f.cuit_entidad || '' }; 
      });
      setFacturas(procesadas); setMovimientos(todosLosMovimientos);
      if (modalCobro) { const act = procesadas.find(f => f.id === modalCobro.id); if (act) setModalCobro(act); }
    }
  };

  const crearEmpresa = async () => {
    if (!datosEmpresa.cuit || !datosEmpresa.razonSocial) return alert("Faltan datos");
    setLoading(true);
    const { data } = await supabase.from('empresas').insert([{ ...datosEmpresa, user_id: session.user.id }]).select();
    if (data) { await fetchEmpresas(); setModoNuevaEmpresa(false); setEmpresaSeleccionada(data[0].id); }
    setLoading(false);
  };

  const guardarFactura = async () => {
    if (!empresaSeleccionada) return alert("Seleccioná empresa");
    setLoading(true);
    const existe = entidadesFrecuentes.find(e => e.razon_social === formData.entidad);
    if (!existe && formData.entidad && formData.cuitEntidad) {
      await supabase.from('entidades_frecuentes').insert([{ cuit: formData.cuitEntidad, razon_social: formData.entidad, tipo: formData.tipo === 'Venta' ? 'Cliente' : 'Proveedor', user_id: session.user.id }]);
      fetchEntidadesFrecuentes();
    }
    const { error } = await supabase.from('facturas').insert([{ tipo: formData.tipo, fecha_comprobante: formData.fecha, entidad: formData.entidad, cuit_entidad: formData.cuitEntidad, punto_venta: formData.puntoVenta, numero_comprobante: formData.numero, neto: formData.neto, total: formData.total, porcentaje_iibb_exento: formData.porcentajeExentoIIBB, cuit_empresa: datosEmpresa.cuit, user_id: session.user.id }]);
    if (!error) { fetchDataCompleta(datosEmpresa.cuit); setFormData({...formData, entidad: '', cuitEntidad: '', neto: 0, total: 0, puntoVenta: '', numero: '', porcentajeExentoIIBB: 0}); } else alert(error.message);
    setLoading(false);
  };
  
  const borrarFactura = async (id) => { if (!window.confirm("¿Seguro querés borrar esta factura?")) return; await supabase.from('facturas').delete().eq('id', id); fetchDataCompleta(datosEmpresa.cuit); };
  const borrarMovimiento = async (id) => { if (!window.confirm("¿Eliminar este pago/movimiento?")) return; await supabase.from('movimientos_caja').delete().eq('id', id); fetchDataCompleta(datosEmpresa.cuit); };
  
  const guardarMovimientoCompleto = async () => {
    const datos = { factura_id: modalCobro.id, tipo_movimiento: 'factura', fecha_pago: formCobro.fechaEmision, fecha_efectiva: formCobro.fechaEfectiva, importe: formCobro.importe, ret_ganancias: formCobro.retGanancias, ret_iva: formCobro.retIva, ret_iibb: formCobro.retIibb, nota: formCobro.nota, user_id: session.user.id };
    let error;
    if (movimientoEdicion) error = (await supabase.from('movimientos_caja').update(datos).eq('id', movimientoEdicion)).error;
    else error = (await supabase.from('movimientos_caja').insert([datos])).error;
    if (!error) { fetchDataCompleta(datosEmpresa.cuit); setMovimientoEdicion(null); setFormCobro({ fechaEmision: new Date().toISOString().split('T')[0], fechaEfectiva: new Date().toISOString().split('T')[0], importe: 0, retGanancias: 0, retIva: 0, retIibb: 0, nota: '' }); } else alert(error.message);
  };

  const guardarMovimientoManual = async () => { 
    const payload = { tipo_movimiento: formInversion.tipo, fecha_pago: formInversion.fecha, fecha_efectiva: formInversion.fecha, importe: formInversion.importe, nota: formInversion.descripcion, user_id: session.user.id };
    let error;
    if (formInversion.id) {
       const res = await supabase.from('movimientos_caja').update(payload).eq('id', formInversion.id);
       error = res.error;
    } else {
       const res = await supabase.from('movimientos_caja').insert([payload]);
       error = res.error;
    }
    if (!error) { fetchDataCompleta(datosEmpresa.cuit); setModalInversion(false); setFormInversion({ id: null, tipo: 'saldo_inicial', fecha: new Date().toISOString().split('T')[0], importe: 0, descripcion: '' }); } else alert(error.message); 
  };

  const prepararEdicionManual = (mov) => {
    setFormInversion({ id: mov.id, tipo: mov.tipo_movimiento, fecha: mov.fecha_pago, importe: mov.importe, descripcion: mov.nota || '' });
    setModalInversion(true);
  };

  const prepararEdicion = (mov) => { setMovimientoEdicion(mov.id); setFormCobro({ fechaEmision: mov.fecha_pago, fechaEfectiva: mov.fecha_efectiva || mov.fecha_pago, importe: mov.importe, retGanancias: mov.ret_ganancias || 0, retIva: mov.ret_iva || 0, retIibb: mov.ret_iibb || 0, nota: mov.nota || '' }); };

  const handleRetencionChange = (tipoRet, valor) => {
    const nuevoForm = { ...formCobro, [tipoRet]: valor };
    if (!movimientoEdicion) {
      const rGan = Number(tipoRet === 'retGanancias' ? valor : nuevoForm.retGanancias) || 0;
      const rIva = Number(tipoRet === 'retIva' ? valor : nuevoForm.retIva) || 0;
      const rIibb = Number(tipoRet === 'retIibb' ? valor : nuevoForm.retIibb) || 0;
      const totalRet = rGan + rIva + rIibb;
      nuevoForm.importe = Math.max(0, modalCobro.saldo - totalRet);
    }
    setFormCobro(nuevoForm);
  };

  const facturasFiltradas = facturas.filter(f => {
    const textoMatch = 
       f.entidad.toLowerCase().includes(filtroTextoFactura.toLowerCase()) ||
       f.fecha_comprobante.includes(filtroTextoFactura) ||
       (f.cuit_entidad && f.cuit_entidad.includes(filtroTextoFactura)) ||
       (f.numero_comprobante && f.numero_comprobante.includes(filtroTextoFactura)) ||
       f.total.toString().includes(filtroTextoFactura);
    return f.tipo === filtroTipoFactura && textoMatch;
  });

  return (
    <div className="max-w-7xl mx-auto pb-10 space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-600 flex justify-between items-center"><div className="w-2/3"><label className="text-xs font-bold text-gray-500 uppercase">Empresa Activa</label>{!modoNuevaEmpresa ? (<select className="w-full p-2 border rounded-lg text-lg font-bold mt-1" value={empresaSeleccionada} onChange={(e) => e.target.value === 'nueva' ? setModoNuevaEmpresa(true) : setEmpresaSeleccionada(e.target.value)}><option value="">-- Seleccionar --</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.razon_social}</option>)}<option value="nueva">+ Nueva Empresa...</option></select>) : (<div className="flex gap-2 mt-1"><input placeholder="Razón Social" className="p-2 border rounded" onChange={e => setDatosEmpresa({...datosEmpresa, razonSocial: e.target.value})} /><input placeholder="CUIT" className="p-2 border rounded" onChange={e => setDatosEmpresa({...datosEmpresa, cuit: e.target.value})} /><button onClick={crearEmpresa} className="bg-blue-600 text-white px-3 rounded font-bold">Guardar</button><button onClick={() => setModoNuevaEmpresa(false)} className="text-gray-500 px-3">X</button></div>)}</div><div className="text-right text-sm text-gray-500">Usuario: {session.user.email}</div></div>

      {empresaSeleccionada && !modoNuevaEmpresa && (
        <>
          <div className="flex border-b border-gray-200 mb-6 bg-white rounded-t-xl px-2 overflow-x-auto">
            <button onClick={() => setActiveTab('gestion')} className={`px-6 py-4 font-bold text-sm transition whitespace-nowrap ${activeTab === 'gestion' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-500'}`}>📂 Gestión Diaria</button>
            <button onClick={() => setActiveTab('finanzas')} className={`px-6 py-4 font-bold text-sm transition whitespace-nowrap ${activeTab === 'finanzas' ? 'border-b-4 border-purple-600 text-purple-600' : 'text-gray-500'}`}>💸 Cash Flow, Deudas y Calendario</button>
            <button onClick={() => setActiveTab('resultados')} className={`px-6 py-4 font-bold text-sm transition whitespace-nowrap ${activeTab === 'resultados' ? 'border-b-4 border-green-600 text-green-600' : 'text-gray-500'}`}>📊 Resultados e Impuestos</button>
          </div>

          {activeTab === 'gestion' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 bg-white p-5 rounded-xl shadow-lg border border-gray-100 h-fit sticky top-4">
                <h3 className="font-bold text-gray-800 mb-4">＋ Nueva Factura</h3>
                <div className="space-y-3">
                  <div className="flex bg-gray-100 p-1 rounded">{['Venta', 'Compra'].map(t => (<button key={t} onClick={() => setFormData({...formData, tipo: t})} className={`flex-1 py-1 text-sm font-bold rounded transition ${formData.tipo === t ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>{t}</button>))}</div>
                  
                  <div><label className="text-xs text-gray-500">Fecha del Comprobante</label><input type="date" className="w-full p-2 border rounded text-sm" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} /></div>

                  <div className="grid grid-cols-2 gap-2"><div className="col-span-2"><label className="text-xs text-gray-500">Razón Social</label><input list="entidades" className="w-full p-2 border rounded text-sm" placeholder="Nombre..." value={formData.entidad} onChange={e => { const val = e.target.value; const found = entidadesFrecuentes.find(ent => ent.razon_social === val); setFormData({...formData, entidad: val, cuitEntidad: found ? found.cuit : formData.cuitEntidad}); }} /><datalist id="entidades">{entidadesFrecuentes.filter(e => e.tipo === (formData.tipo === 'Venta' ? 'Cliente' : 'Proveedor')).map(e => (<option key={e.id} value={e.razon_social}>{e.cuit}</option>))}</datalist></div><div className="col-span-2"><label className="text-xs text-gray-500">CUIT (Opcional)</label><input type="text" className="w-full p-2 border rounded text-sm bg-gray-50" placeholder="Ej: 30123456789" value={formData.cuitEntidad} onChange={e => setFormData({...formData, cuitEntidad: e.target.value})} /></div></div>
                  <div className="grid grid-cols-2 gap-2"><div><label className="text-xs text-gray-500">Neto ($)</label><input type="number" className="w-full p-2 border rounded text-sm" value={formData.neto} onChange={e => setFormData({...formData, neto: e.target.value})} /></div><div><label className="text-xs text-gray-500">IVA (%)</label><select className="w-full p-2 border rounded text-sm" value={formData.alicuotaIva} onChange={e => setFormData({...formData, alicuotaIva: e.target.value})}><option value="21">21%</option><option value="10.5">10.5%</option><option value="0">0%</option></select></div></div>
                  <div className="grid grid-cols-3 gap-2"><div className="col-span-1"><label className="text-xs text-gray-500">Pto Vta</label><input className="w-full p-2 border rounded" value={formData.puntoVenta} onChange={e=>setFormData({...formData, puntoVenta:e.target.value})} /></div><div className="col-span-2"><label className="text-xs text-gray-500">Nro Comp</label><input className="w-full p-2 border rounded" value={formData.numero} onChange={e=>setFormData({...formData, numero:e.target.value})} /></div></div>
                  
                  {formData.tipo === 'Venta' && (
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">% Exento IIBB (CM)</label>
                      <div className="flex items-center gap-2"><input type="number" min="0" max="100" className="w-20 p-2 border rounded text-sm text-center font-bold" value={formData.porcentajeExentoIIBB} onChange={e => setFormData({...formData, porcentajeExentoIIBB: e.target.value})} /><span className="text-xs text-gray-400">% no paga IIBB</span></div>
                    </div>
                  )}

                  <div className="pt-2 border-t flex justify-between items-center"><span className="font-bold text-gray-700">Total: ${formatCurrency(formData.total)}</span><button onClick={guardarFactura} disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700 text-sm">Guardar</button></div>
                </div>
              </div>
              
              <div className="lg:col-span-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="p-4 bg-gray-50 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
                     <button onClick={() => setFiltroTipoFactura('Venta')} className={`px-4 py-2 text-sm font-bold transition ${filtroTipoFactura === 'Venta' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>Ventas</button>
                     <button onClick={() => setFiltroTipoFactura('Compra')} className={`px-4 py-2 text-sm font-bold transition ${filtroTipoFactura === 'Compra' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>Compras</button>
                  </div>
                  <input type="text" placeholder="🔍 Buscar comprobante..." className="p-2 border rounded-lg text-sm w-full md:w-64" value={filtroTextoFactura} onChange={e => setFiltroTextoFactura(e.target.value)} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="text-xs uppercase text-gray-500 bg-white border-b">
                      <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Entidad</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3 text-center">Acciones</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {facturasFiltradas.map((f) => (
                        <tr key={f.id} className="hover:bg-gray-50 text-sm">
                          <td className="px-4 py-3 text-gray-500">{f.fecha_comprobante}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">{f.entidad}<span className="block text-[10px] text-gray-400">FC: {f.punto_venta}-{f.numero_comprobante}</span></td>
                          <td className="px-4 py-3 text-right font-bold">${formatCurrency(f.total)}</td>
                          <td className="px-4 py-3 text-right"><span className={`px-2 py-1 rounded font-bold text-xs ${f.saldo <= 0.01 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>${formatCurrency(f.saldo)}</span></td>
                          <td className="px-4 py-3 text-center flex justify-center gap-2">
                            <button onClick={() => { setModalCobro(f); setMovimientoEdicion(null); setFormCobro({ fechaEmision: new Date().toISOString().split('T')[0], fechaEfectiva: new Date().toISOString().split('T')[0], importe: 0, retGanancias: 0, retIva: 0, retIibb: 0, nota: '' }); }} className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full font-bold">$</button>
                            <button onClick={() => borrarFactura(f.id)} className="text-gray-300 hover:text-red-500 text-lg">🗑</button>
                          </td>
                        </tr>
                      ))}
                      {facturasFiltradas.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-gray-400">No se encontraron {filtroTipoFactura.toLowerCase()}s.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'finanzas' && (
            <div>
               <div className="flex justify-end mb-4"><button onClick={() => { setFormInversion({ id: null, tipo: 'saldo_inicial', fecha: new Date().toISOString().split('T')[0], importe: 0, descripcion: '' }); setModalInversion(true); }} className="bg-purple-600 text-white px-4 py-2 rounded shadow font-bold hover:bg-purple-700 flex items-center gap-2">⚡ Nuevo Movimiento de Fondos</button></div>
               <FinancialDashboard facturas={facturas} movimientos={movimientos} onDeleteMovimiento={borrarMovimiento} onEditMovimiento={prepararEdicionManual} />
            </div>
          )}

          {activeTab === 'resultados' && (
             <ResultsDashboard facturas={facturas} movimientos={movimientos} configImpuestos={configImpuestos} setConfigImpuestos={setConfigImpuestos} />
          )}
        </>
      )}

      {/* MODALES REUTILIZADOS */}
      {modalInversion && (<div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-xl shadow-2xl w-96"><h3 className="text-lg font-bold mb-4">{formInversion.id ? '✏️ Editar Movimiento' : '⚡ Nuevo Movimiento'}</h3><div className="space-y-3"><div><label className="text-xs font-bold text-gray-500">Tipo</label>
      <select className="w-full p-2 border rounded" value={formInversion.tipo} onChange={e => setFormInversion({...formInversion, tipo: e.target.value})}>
         <optgroup label="Ingresos a Caja"><option value="saldo_inicial">💰 Carga de Saldo Inicial (Caja)</option><option value="inversion_rescate">📥 Rescate Inversión (Entrada a Caja)</option></optgroup>
         <optgroup label="Inversiones"><option value="saldo_inicial_inversion">🏦 Carga de Saldo Inicial (Inversión)</option><option value="inversion_ingreso">📈 Enviar a Inversión (Salida de Caja)</option><option value="interes_inversion">✨ Intereses Ganados (Suma a Inversión)</option></optgroup>
         <optgroup label="Egresos y Gastos"><option value="pago_impuesto">💸 Pago Impuestos</option><option value="pago_servicio">💡 Pago Servicios</option><option value="gasto_vario">🛒 Gastos Varios</option><option value="vencimiento_tarjeta">💳 Vencimiento Tarjeta de Crédito</option></optgroup>
         <optgroup label="Impuestos Especiales"><option value="retencion_sircreb">🏦 Retención SIRCREB (IIBB)</option><option value="retencion_ley_25413">🏦 Imp. Ley 25.413 (A cuenta Ganancias)</option><option value="pago_autonomos">💼 Pago Autónomos (Deducción Gan.)</option></optgroup>
      </select></div><div><label className="text-xs text-gray-500">Fecha</label><input type="date" className="w-full p-2 border rounded" value={formInversion.fecha} onChange={e => setFormInversion({...formInversion, fecha: e.target.value})} /></div><div><label className="text-xs text-gray-500">Importe</label><input type="number" className="w-full p-2 border rounded font-bold" value={formInversion.importe} onChange={e => setFormInversion({...formInversion, importe: e.target.value})} /></div><div><label className="text-xs text-gray-500">Descripción</label><input className="w-full p-2 border rounded" value={formInversion.descripcion} onChange={e => setFormInversion({...formInversion, descripcion: e.target.value})} /></div><button onClick={guardarMovimientoManual} className="w-full bg-purple-600 text-white py-2 rounded font-bold">{formInversion.id ? 'Guardar Cambios' : 'Registrar'}</button><button onClick={() => setModalInversion(false)} className="w-full mt-2 text-gray-500 text-sm">Cancelar (ESC)</button></div></div></div>)}
      
      {/* MODAL COBROS Y PAGOS */}
      {modalCobro && (<div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"><div className="p-6 border-b flex justify-between items-start"><div><h3 className="text-xl font-bold text-gray-800">Gestión Financiera: {modalCobro.entidad}</h3><p className="text-sm text-gray-500">FC: {modalCobro.punto_venta}-{modalCobro.numero_comprobante} | Total: ${formatCurrency(modalCobro.total)}</p></div><div className="text-right"><p className="text-xs text-gray-500 uppercase">Saldo Pendiente</p><p className={`text-2xl font-bold ${modalCobro.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>${formatCurrency(modalCobro.saldo)}</p></div></div><div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8"><div className="bg-gray-50 p-4 rounded-xl border border-gray-200 h-fit"><h4 className="font-bold text-gray-700 mb-3 text-sm flex justify-between"><span>{movimientoEdicion ? '✎ Editando' : '＋ Nuevo Movimiento'}</span>{movimientoEdicion && <button onClick={() => { setMovimientoEdicion(null); setFormCobro({ fechaEmision: new Date().toISOString().split('T')[0], fechaEfectiva: new Date().toISOString().split('T')[0], importe: 0, retGanancias: 0, retIva: 0, retIibb: 0, nota: '' }); }} className="text-xs text-red-500 underline">Cancelar</button>}</h4><div className="space-y-3"><div className="grid grid-cols-2 gap-2"><div><label className="text-xs text-gray-500 font-bold">Emisión</label><input type="date" className="w-full p-2 border rounded text-sm bg-white" value={formCobro.fechaEmision} onChange={e => setFormCobro({...formCobro, fechaEmision: e.target.value})} /></div><div><label className="text-xs text-blue-600 font-bold">Efectiva</label><input type="date" className="w-full p-2 border rounded text-sm bg-white border-blue-200" value={formCobro.fechaEfectiva} onChange={e => setFormCobro({...formCobro, fechaEfectiva: e.target.value})} /></div></div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs text-gray-500 font-bold">Importe (Neto Cobrado/Pagado)</label>
                      {!movimientoEdicion && (
                         <button type="button" onClick={() => setFormCobro({...formCobro, importe: modalCobro.saldo, retGanancias: 0, retIva: 0, retIibb: 0})} className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition font-bold shadow-sm">
                           Saldar Total (Sin Ret.)
                         </button>
                      )}
                    </div>
                    <input type="number" className="w-full p-2 border rounded font-bold text-blue-700 text-lg" placeholder="$ 0.00" value={formCobro.importe} onChange={e => setFormCobro({...formCobro, importe: e.target.value})} />
                  </div>
                  
                  <div className="bg-white p-3 rounded border border-gray-200 space-y-2">
                    <p className="text-xs font-bold text-gray-400 uppercase border-b pb-1 mb-2">Retenciones {modalCobro.tipo === 'Venta' ? '(Sufridas)' : '(Practicadas)'}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-500">Gan.</label>
                        <input type="number" className="w-full p-1 border rounded text-xs" value={formCobro.retGanancias} onChange={e => handleRetencionChange('retGanancias', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500">IVA</label>
                        <input type="number" className="w-full p-1 border rounded text-xs" value={formCobro.retIva} onChange={e => handleRetencionChange('retIva', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500">IIBB</label>
                        <input type="number" className="w-full p-1 border rounded text-xs" value={formCobro.retIibb} onChange={e => handleRetencionChange('retIibb', e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <input type="text" className="w-full p-2 border rounded text-sm" placeholder="Nota..." value={formCobro.nota} onChange={e => setFormCobro({...formCobro, nota: e.target.value})} /><button onClick={guardarMovimientoCompleto} className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 transition">{movimientoEdicion ? 'Guardar Cambios' : 'Registrar'}</button></div></div><div className="space-y-3"><h4 className="font-bold text-gray-700 text-sm">Historial de Pagos</h4><div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">{modalCobro.movimientos_caja && modalCobro.movimientos_caja.map((mov) => (<div key={mov.id} className="p-3 rounded-lg border text-sm flex justify-between items-center bg-white border-gray-100 shadow-sm"><div><p className="font-bold text-gray-800">${formatCurrency(mov.importe)}</p><p className="text-xs text-gray-500">{new Date(mov.fecha_pago).toLocaleDateString()} {mov.fecha_pago !== mov.fecha_efectiva && <span className="text-blue-500">➜ Efec: {new Date(mov.fecha_efectiva).toLocaleDateString()}</span>}</p>{(mov.ret_ganancias > 0 || mov.ret_iva > 0 || mov.ret_iibb > 0) && <p className="text-[10px] text-orange-600 mt-1">Retenciones: {mov.ret_ganancias > 0 && `G: ${mov.ret_ganancias} `} {mov.ret_iva > 0 && `I: ${mov.ret_iva} `} {mov.ret_iibb > 0 && `IIBB: ${mov.ret_iibb}`}</p>}</div><div className="flex gap-2"><button onClick={() => prepararEdicion(mov)} className="text-blue-600">✎</button><button onClick={() => borrarMovimiento(mov.id)} className="text-red-400">🗑</button></div></div>))}</div></div></div><div className="p-4 border-t bg-gray-50 flex justify-end"><button onClick={() => setModalCobro(null)} className="px-6 py-2 bg-white border border-gray-300 rounded font-bold text-gray-600 hover:bg-gray-100">Cerrar (ESC)</button></div></div></div>)}
    </div>
  );
};

const App = () => { 
  const [session, setSession] = useState(null); 
  const [email, setEmail] = useState(''); 
  const [password, setPassword] = useState(''); 
  const [loading, setLoading] = useState(false); 

  useEffect(() => { 
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session)); 
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session)); 
    return () => subscription.unsubscribe(); 
  }, []); 

  const handleLogin = async (e) => { 
    e.preventDefault(); 
    setLoading(true); 
    const { error } = await supabase.auth.signInWithPassword({ email, password }); 
    if (error) alert(error.message); 
    setLoading(false); 
  }; 

  if (!session) return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-xl p-8">
          <h1 className="text-3xl font-bold text-center text-blue-900 mb-6">Gestión PyME</h1>
          <form className="space-y-4">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="Email" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="Contraseña" />
            <button onClick={handleLogin} disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold">{loading ? '...' : 'Entrar'}</button>
          </form>
        </div>
      </div>
      <Analytics />
      <SpeedInsights />
    </>
  ); 

  return (
    <>
      <div className="min-h-screen bg-gray-50 font-sans p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-blue-900">Sistema PyME</h1>
          <button onClick={() => supabase.auth.signOut()} className="text-red-500 font-bold text-sm">Salir</button>
        </div>
        <InvoiceManager session={session} />
      </div>
      <Analytics />
      <SpeedInsights />
    </>
  ); 
};

export default App;