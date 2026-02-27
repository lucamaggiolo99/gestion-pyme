import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Analytics } from '@vercel/analytics/react'; // <-- AGREGADO VERCEL ANALYTICS

// --- CONFIGURACIÓN SUPABASE ---
const supabaseUrl = 'https://zvypvqyawwkghqnmiazq.supabase.co';
const supabaseKey = 'sb_publishable_kx9ImY8obdsR-EPEB70c7w_EePKNmE1';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- COMPONENTE 2: CASH FLOW Y DEUDAS (FINANCIERO) ---
const FinancialDashboard = ({ facturas, movimientos, onDeleteMovimiento }) => {
  const [detalleDeuda, setDetalleDeuda] = useState(null); 

  const posicion = useMemo(() => {
    const hoy = new Date().toISOString().split('T')[0];
    let cajaHoy = 0, inversiones = 0, aCobrarFuturo = 0, aPagarFuturo = 0;

    movimientos.forEach(mov => {
      const esFuturo = mov.fecha_efectiva > hoy;
      const monto = Number(mov.importe);
      let esIngreso = false;
      let esEgreso = false;

      if (['saldo_inicial', 'inversion_rescate', 'saldo_inicial_inversion', 'interes_inversion'].includes(mov.tipo_movimiento)) esIngreso = true;
      else if (['inversion_ingreso', 'pago_impuesto', 'pago_servicio', 'gasto_vario'].includes(mov.tipo_movimiento)) esEgreso = true;
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
      else if (['inversion_ingreso', 'pago_impuesto', 'pago_servicio', 'gasto_vario'].includes(mov.tipo_movimiento)) esIngreso = false;
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
      if (Math.abs(f.saldo) > 10) { 
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

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-blue-600">
          <p className="text-gray-500 text-xs uppercase font-bold">Caja Operativa</p>
          <p className="text-2xl font-bold text-gray-800">${posicion.cajaHoy.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-purple-500">
          <p className="text-gray-500 text-xs uppercase font-bold">Inversiones</p>
          <p className="text-2xl font-bold text-purple-700">${posicion.inversiones.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-orange-400 opacity-80">
          <p className="text-gray-500 text-xs uppercase font-bold">A Cobrar (Futuro)</p>
          <p className="text-xl font-bold text-orange-600">+ ${posicion.aCobrarFuturo.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow border-l-4 border-red-400 opacity-80">
          <p className="text-gray-500 text-xs uppercase font-bold">A Pagar (Futuro)</p>
          <p className="text-xl font-bold text-red-600">- ${posicion.aPagarFuturo.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">📊 Libro Mayor de Caja</h3>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-800 text-white uppercase text-xs sticky top-0">
              <tr>
                <th className="p-3">Fecha Efectiva</th><th className="p-3">Concepto</th>
                <th className="p-3 text-right text-green-400">Ingresos</th><th className="p-3 text-right text-red-400">Egresos</th>
                <th className="p-3 text-right font-bold bg-gray-700">Saldo Final</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-700">
              {flujoEvolutivo.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="p-3 whitespace-nowrap">{new Date(row.fecha + 'T00:00:00').toLocaleDateString()}</td>
                  <td className="p-3 font-medium text-gray-600">{row.descripcion}</td>
                  <td className="p-3 text-right text-green-600 font-medium">{row.ingreso > 0 ? `+ $${row.ingreso.toLocaleString()}` : '-'}</td>
                  <td className="p-3 text-right text-red-600 font-medium">{row.egreso > 0 ? `- $${row.egreso.toLocaleString()}` : '-'}</td>
                  <td className={`p-3 text-right font-bold ${row.saldoFinal >= 0 ? 'text-blue-700 bg-blue-50' : 'text-red-700 bg-red-50'}`}>${row.saldoFinal.toLocaleString()}</td>
                </tr>
              ))}
              {flujoEvolutivo.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-gray-400">Sin movimientos registrados.</td></tr>}
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
                 <span className="text-red-600 font-bold">${c.saldo.toLocaleString()}</span>
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
                 <span className="text-orange-600 font-bold">${c.saldo.toLocaleString()}</span>
               </div>
            ))}
            {cuentasCorrientes.proveedores.length === 0 && <p className="text-sm text-gray-400 p-2">Sin deudas pendientes.</p>}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
        <h3 className="font-bold text-gray-800 mb-4">📋 Edición de Movimientos Manuales</h3>
        <div className="overflow-x-auto max-h-60">
           <table className="w-full text-sm text-left">
             <thead className="bg-gray-50 uppercase text-xs text-gray-500"><tr><th className="p-3">Fecha</th><th className="p-3">Tipo</th><th className="p-3">Descripción</th><th className="p-3 text-right">Importe</th><th className="p-3 text-center">Acción</th></tr></thead>
             <tbody className="divide-y">
               {movimientos.filter(m => m.tipo_movimiento !== 'factura').map(m => (
                 <tr key={m.id} className="hover:bg-gray-50"><td className="p-3">{m.fecha_pago}</td><td className="p-3"><span className="text-xs font-bold px-2 py-1 rounded bg-gray-100">{m.tipo_movimiento.replace(/_/g, ' ').toUpperCase()}</span></td><td className="p-3 text-gray-600">{m.nota}</td><td className="p-3 text-right font-mono font-bold">${m.importe.toLocaleString()}</td><td className="p-3 text-center"><button onClick={() => onDeleteMovimiento(m.id)} className="text-red-500 hover:bg-red-50 px-2 py-1 rounded">🗑 Eliminar</button></td></tr>
               ))}
             </tbody>
           </table>
        </div>
      </div>

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
                 <p className={`text-3xl font-bold ${detalleDeuda.tipo === 'Cliente' ? 'text-red-600' : 'text-orange-600'}`}>${detalleDeuda.saldo.toLocaleString()}</p>
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
                      <td className="py-3 text-right text-gray-500">${comp.total.toLocaleString()}</td>
                      <td className="py-3 text-right font-bold text-gray-800">${comp.saldo.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button onClick={() => setDetalleDeuda(null)} className="px-6 py-2 bg-white border border-gray-300 rounded font-bold text-gray-600 hover:bg-gray-100">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- COMPONENTE 3: RESULTADOS E IMPUESTOS ---
const ResultsDashboard = ({ facturas, movimientos, configImpuestos, setConfigImpuestos }) => {
  const [añoExpandido, setAñoExpandido] = useState(null);

  const datosAnuales = useMemo(() => {
    const años = {};

    const asegurarEstructura = (año, mes) => {
      if (!años[año]) años[año] = { 
        totales: { ventas:0, compras:0, cobros:0, pagos:0, ivaDeb:0, ivaCred:0, baseIIBB:0, retIva:0, retIIBB:0, retGan:0 }, 
        meses: {} 
      };
      if (!años[año].meses[mes]) años[año].meses[mes] = { 
        ventas:0, compras:0, cobros:0, pagos:0, ivaDeb:0, ivaCred:0, baseIIBB:0, retIva:0, retIIBB:0, retGan:0 
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
      } else {
        años[año].totales.compras += neto; años[año].meses[mes].compras += neto;
        años[año].totales.ivaCred += iva;  años[año].meses[mes].ivaCred += iva;
      }
    });

    movimientos.forEach(mov => {
      const monto = Number(mov.importe);
      
      const mesFin = mov.fecha_efectiva.substring(0, 7);
      const añoFin = mesFin.substring(0, 4);
      asegurarEstructura(añoFin, mesFin);

      let esIngreso = false; let esEgreso = false;
      if (['saldo_inicial', 'inversion_rescate', 'saldo_inicial_inversion', 'interes_inversion'].includes(mov.tipo_movimiento)) esIngreso = true;
      else if (['inversion_ingreso', 'pago_impuesto', 'pago_servicio', 'gasto_vario'].includes(mov.tipo_movimiento)) esEgreso = true;
      else if (mov.tipo_movimiento === 'factura') {
        const f = facturas.find(x => x.id === mov.factura_id);
        if (f) { if (f.tipo === 'Venta') esIngreso = true; else esEgreso = true; }
      }
      if (esIngreso) { años[añoFin].totales.cobros += monto; años[añoFin].meses[mesFin].cobros += monto; }
      if (esEgreso) { años[añoFin].totales.pagos += monto; años[añoFin].meses[mesFin].pagos += monto; }

      if (mov.fecha_pago) {
        const mesFis = mov.fecha_pago.substring(0, 7);
        const añoFis = mesFis.substring(0, 4);
        asegurarEstructura(añoFis, mesFis);
        
        años[añoFis].totales.retIva += Number(mov.ret_iva || 0); años[añoFis].meses[mesFis].retIva += Number(mov.ret_iva || 0);
        años[añoFis].totales.retIIBB += Number(mov.ret_iibb || 0); años[añoFis].meses[mesFis].retIIBB += Number(mov.ret_iibb || 0);
        años[añoFis].totales.retGan += Number(mov.ret_ganancias || 0); años[añoFis].meses[mesFis].retGan += Number(mov.ret_ganancias || 0);
      }
    });

    const resultadoArr = Object.entries(años).sort((a, b) => b[0].localeCompare(a[0])).map(([año, data]) => {
      const mesesOrdenados = Object.entries(data.meses).sort((a, b) => b[0].localeCompare(a[0]));
      return { año, totales: data.totales, meses: mesesOrdenados };
    });

    return resultadoArr;
  }, [facturas, movimientos]);

  const toggleAño = (año) => setAñoExpandido(añoExpandido === año ? null : año);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center">
        <h3 className="font-bold text-gray-800">⚙️ Configuración Fiscal</h3>
        <div className="flex gap-4">
           <div className="flex items-center gap-2"><label className="text-xs font-bold text-gray-500">Alícuota IIBB %</label><input type="number" value={configImpuestos.iibb} onChange={e => setConfigImpuestos({...configImpuestos, iibb: e.target.value})} className="w-16 p-1 border rounded text-right font-bold" /></div>
           <div className="flex items-center gap-2"><label className="text-xs font-bold text-gray-500">Ganancias %</label><input type="number" value={configImpuestos.ganancias} onChange={e => setConfigImpuestos({...configImpuestos, ganancias: e.target.value})} className="w-16 p-1 border rounded text-right font-bold" /></div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
        <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
           <h3 className="font-bold text-gray-800">🗓️ Resumen Anual y Detalle Mensual</h3>
           <p className="text-xs text-gray-500">Ganancias se calcula sobre el total del año.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center">
            <thead className="bg-gray-800 text-white uppercase text-xs">
              <tr>
                <th className="p-3 text-left border-r border-gray-700 w-32">Periodo</th>
                <th className="p-3 text-gray-300">Res. Económico<br/><span className="text-[9px]">(Ventas - Compras)</span></th>
                <th className="p-3 text-gray-300 border-r border-gray-700">Res. Financiero<br/><span className="text-[9px]">(Cobros - Pagos)</span></th>
                <th className="p-3">IVA (A pagar)<br/><span className="text-[9px]">(Mensual)</span></th>
                <th className="p-3">IIBB (A pagar)<br/><span className="text-[9px]">(Mensual)</span></th>
                <th className="p-3 text-green-400">Prov. Ganancias<br/><span className="text-[9px]">(Cálculo Anual)</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {datosAnuales.map((item) => {
                const { año, totales, meses } = item;
                
                const resEcoAnual = totales.ventas - totales.compras;
                const resFinAnual = totales.cobros - totales.pagos;
                const saldoIvaAnual = totales.ivaDeb - totales.ivaCred;
                const aPagarIvaAnual = Math.max(0, saldoIvaAnual - totales.retIva);
                const impuestoIIBBAnual = (totales.baseIIBB * configImpuestos.iibb) / 100;
                const aPagarIIBBAnual = Math.max(0, impuestoIIBBAnual - totales.retIIBB);
                
                const provGanAnual = Math.max(0, resEcoAnual * (configImpuestos.ganancias / 100));
                const aPagarGanAnual = Math.max(0, provGanAnual - totales.retGan);
                
                const isExpanded = añoExpandido === año;

                return (
                  <React.Fragment key={año}>
                    <tr className={`hover:bg-blue-50 transition cursor-pointer ${isExpanded ? 'bg-blue-50' : 'bg-white'}`} onClick={() => toggleAño(año)}>
                      <td className="p-3 text-left border-r font-bold text-lg text-blue-900 flex items-center gap-2">
                        {isExpanded ? '🔽' : '▶️'} Año {año}
                      </td>
                      <td className={`p-3 font-bold text-lg ${resEcoAnual >= 0 ? 'text-green-600' : 'text-red-600'}`}>${resEcoAnual.toLocaleString()}</td>
                      <td className={`p-3 font-bold text-lg border-r ${resFinAnual >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>${resFinAnual.toLocaleString()}</td>
                      <td className="p-3 font-bold text-gray-600" title="Sumatoria anual referencial">${aPagarIvaAnual.toLocaleString()}</td>
                      <td className="p-3 font-bold text-gray-600" title="Sumatoria anual referencial">${aPagarIIBBAnual.toLocaleString()}</td>
                      <td className="p-3 font-bold text-xl text-green-700 bg-green-50 border-l-4 border-green-500">${aPagarGanAnual.toLocaleString()}</td>
                    </tr>

                    {isExpanded && meses.map(([mes, d]) => {
                       const resEcoMes = d.ventas - d.compras;
                       const resFinMes = d.cobros - d.pagos;
                       const aPagarIvaMes = Math.max(0, (d.ivaDeb - d.ivaCred) - d.retIva);
                       const aPagarIIBBMes = Math.max(0, ((d.baseIIBB * configImpuestos.iibb) / 100) - d.retIIBB);
                       
                       return (
                         <tr key={mes} className="bg-gray-100 text-sm border-b border-gray-200">
                           <td className="p-2 text-left pl-8 border-r text-gray-600 font-medium">↳ {mes}</td>
                           <td className={`p-2 ${resEcoMes >= 0 ? 'text-green-600' : 'text-red-500'}`}>${resEcoMes.toLocaleString()}</td>
                           <td className={`p-2 border-r ${resFinMes >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>${resFinMes.toLocaleString()}</td>
                           <td className="p-2 font-bold text-blue-800">${aPagarIvaMes.toLocaleString()}</td>
                           <td className="p-2 font-bold text-blue-800">${aPagarIIBBMes.toLocaleString()}</td>
                           <td className="p-2 text-gray-400 text-xs italic">Cálculo Anual</td>
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
  
  const [configImpuestos, setConfigImpuestos] = useState({ iibb: 3.0, ganancias: 35.0 });
  const [entidadesFrecuentes, setEntidadesFrecuentes] = useState([]);
  const [modalCobro, setModalCobro] = useState(null);
  const [movimientoEdicion, setMovimientoEdicion] = useState(null);
  const [modalInversion, setModalInversion] = useState(false);

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
    tipo: 'saldo_inicial', fecha: new Date().toISOString().split('T')[0], importe: 0, descripcion: ''
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
  const guardarMovimientoManual = async () => { const { error } = await supabase.from('movimientos_caja').insert([{ tipo_movimiento: formInversion.tipo, fecha_pago: formInversion.fecha, fecha_efectiva: formInversion.fecha, importe: formInversion.importe, nota: formInversion.descripcion, user_id: session.user.id }]); if (!error) { fetchDataCompleta(datosEmpresa.cuit); setModalInversion(false); setFormInversion({ tipo: 'saldo_inicial', fecha: new Date().toISOString().split('T')[0], importe: 0, descripcion: '' }); } else alert(error.message); };
  const prepararEdicion = (mov) => { setMovimientoEdicion(mov.id); setFormCobro({ fechaEmision: mov.fecha_pago, fechaEfectiva: mov.fecha_efectiva || mov.fecha_pago, importe: mov.importe, retGanancias: mov.ret_ganancias || 0, retIva: mov.ret_iva || 0, retIibb: mov.ret_iibb || 0, nota: mov.nota || '' }); };

  return (
    <div className="max-w-7xl mx-auto pb-10 space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-600 flex justify-between items-center"><div className="w-2/3"><label className="text-xs font-bold text-gray-500 uppercase">Empresa Activa</label>{!modoNuevaEmpresa ? (<select className="w-full p-2 border rounded-lg text-lg font-bold mt-1" value={empresaSeleccionada} onChange={(e) => e.target.value === 'nueva' ? setModoNuevaEmpresa(true) : setEmpresaSeleccionada(e.target.value)}><option value="">-- Seleccionar --</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.razon_social}</option>)}<option value="nueva">+ Nueva Empresa...</option></select>) : (<div className="flex gap-2 mt-1"><input placeholder="Razón Social" className="p-2 border rounded" onChange={e => setDatosEmpresa({...datosEmpresa, razonSocial: e.target.value})} /><input placeholder="CUIT" className="p-2 border rounded" onChange={e => setDatosEmpresa({...datosEmpresa, cuit: e.target.value})} /><button onClick={crearEmpresa} className="bg-blue-600 text-white px-3 rounded font-bold">Guardar</button><button onClick={() => setModoNuevaEmpresa(false)} className="text-gray-500 px-3">X</button></div>)}</div><div className="text-right text-sm text-gray-500">Usuario: {session.user.email}</div></div>

      {empresaSeleccionada && !modoNuevaEmpresa && (
        <>
          <div className="flex border-b border-gray-200 mb-6 bg-white rounded-t-xl px-2">
            <button onClick={() => setActiveTab('gestion')} className={`px-6 py-4 font-bold text-sm transition ${activeTab === 'gestion' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-500'}`}>📂 Gestión Diaria</button>
            <button onClick={() => setActiveTab('finanzas')} className={`px-6 py-4 font-bold text-sm transition ${activeTab === 'finanzas' ? 'border-b-4 border-purple-600 text-purple-600' : 'text-gray-500'}`}>💸 Cash Flow y Deudas</button>
            <button onClick={() => setActiveTab('resultados')} className={`px-6 py-4 font-bold text-sm transition ${activeTab === 'resultados' ? 'border-b-4 border-green-600 text-green-600' : 'text-gray-500'}`}>📊 Resultados e Impuestos</button>
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

                  <div className="pt-2 border-t flex justify-between items-center"><span className="font-bold text-gray-700">Total: ${formData.total.toLocaleString()}</span><button onClick={guardarFactura} disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700 text-sm">Guardar</button></div>
                </div>
              </div>
              <div className="lg:col-span-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b flex justify-between items-center"><h3 className="font-bold text-gray-700">Comprobantes</h3><span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">{facturas.length} registros</span></div>
                <div className="overflow-x-auto"><table className="w-full text-left"><thead className="text-xs uppercase text-gray-500 bg-white border-b"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Entidad</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3 text-center">Acciones</th></tr></thead><tbody className="divide-y divide-gray-100">{facturas.map((f) => (<tr key={f.id} className="hover:bg-gray-50 text-sm"><td className="px-4 py-3 text-gray-500">{f.fecha_comprobante}</td><td className="px-4 py-3 font-medium text-gray-800">{f.entidad}<span className="block text-[10px] text-gray-400">{f.cuit_entidad}</span></td><td className="px-4 py-3 text-right font-bold">${f.total.toLocaleString()}</td><td className="px-4 py-3 text-right"><span className={`px-2 py-1 rounded font-bold text-xs ${f.saldo <= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>${f.saldo.toLocaleString()}</span></td><td className="px-4 py-3 text-center flex justify-center gap-2"><button onClick={() => { setModalCobro(f); setMovimientoEdicion(null); setFormCobro({ fechaEmision: new Date().toISOString().split('T')[0], fechaEfectiva: new Date().toISOString().split('T')[0], importe: 0, retGanancias: 0, retIva: 0, retIibb: 0, nota: '' }); }} className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full font-bold">$</button><button onClick={() => borrarFactura(f.id)} className="text-gray-300 hover:text-red-500 text-lg">🗑</button></td></tr>))}</tbody></table></div>
              </div>
            </div>
          )}

          {activeTab === 'finanzas' && (
            <div>
               <div className="flex justify-end mb-4"><button onClick={() => setModalInversion(true)} className="bg-purple-600 text-white px-4 py-2 rounded shadow font-bold hover:bg-purple-700 flex items-center gap-2">⚡ Nuevo Movimiento de Fondos</button></div>
               <FinancialDashboard facturas={facturas} movimientos={movimientos} onDeleteMovimiento={borrarMovimiento} />
            </div>
          )}

          {activeTab === 'resultados' && (
             <ResultsDashboard facturas={facturas} movimientos={movimientos} configImpuestos={configImpuestos} setConfigImpuestos={setConfigImpuestos} />
          )}
        </>
      )}

      {/* MODALES REUTILIZADOS */}
      {modalInversion && (<div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"><div className="bg-white p-6 rounded-xl shadow-2xl w-96"><h3 className="text-lg font-bold mb-4">Movimiento de Fondos</h3><div className="space-y-3"><div><label className="text-xs font-bold text-gray-500">Tipo</label><select className="w-full p-2 border rounded" value={formInversion.tipo} onChange={e => setFormInversion({...formInversion, tipo: e.target.value})}><option value="saldo_inicial">💰 Carga de Saldo Inicial (Caja)</option><option value="saldo_inicial_inversion">🏦 Carga de Saldo Inicial (Inversión)</option><option value="inversion_ingreso">📈 Enviar a Inversión (Salida de Caja)</option><option value="interes_inversion">✨ Intereses Ganados (Suma a Inversión)</option><option value="inversion_rescate">📥 Rescate Inversión (Entrada a Caja)</option><option value="pago_impuesto">💸 Pago Impuestos</option><option value="pago_servicio">💡 Pago Servicios</option><option value="gasto_vario">🛒 Gastos Varios</option></select></div><div><label className="text-xs text-gray-500">Fecha</label><input type="date" className="w-full p-2 border rounded" value={formInversion.fecha} onChange={e => setFormInversion({...formInversion, fecha: e.target.value})} /></div><div><label className="text-xs text-gray-500">Importe</label><input type="number" className="w-full p-2 border rounded font-bold" value={formInversion.importe} onChange={e => setFormInversion({...formInversion, importe: e.target.value})} /></div><div><label className="text-xs text-gray-500">Descripción</label><input className="w-full p-2 border rounded" value={formInversion.descripcion} onChange={e => setFormInversion({...formInversion, descripcion: e.target.value})} /></div><button onClick={guardarMovimientoManual} className="w-full bg-purple-600 text-white py-2 rounded font-bold">Registrar</button><button onClick={() => setModalInversion(false)} className="w-full mt-2 text-gray-500 text-sm">Cancelar</button></div></div></div>)}
      
      {modalCobro && (<div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"><div className="p-6 border-b flex justify-between items-start"><div><h3 className="text-xl font-bold text-gray-800">Gestión Financiera: {modalCobro.entidad}</h3><p className="text-sm text-gray-500">FC: {modalCobro.punto_venta}-{modalCobro.numero_comprobante} | Total: ${modalCobro.total.toLocaleString()}</p></div><div className="text-right"><p className="text-xs text-gray-500 uppercase">Saldo Pendiente</p><p className={`text-2xl font-bold ${modalCobro.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>${modalCobro.saldo.toLocaleString()}</p></div></div><div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8"><div className="bg-gray-50 p-4 rounded-xl border border-gray-200 h-fit"><h4 className="font-bold text-gray-700 mb-3 text-sm flex justify-between"><span>{movimientoEdicion ? '✎ Editando' : '＋ Nuevo Movimiento'}</span>{movimientoEdicion && <button onClick={() => { setMovimientoEdicion(null); setFormCobro({ fechaEmision: new Date().toISOString().split('T')[0], fechaEfectiva: new Date().toISOString().split('T')[0], importe: 0, retGanancias: 0, retIva: 0, retIibb: 0, nota: '' }); }} className="text-xs text-red-500 underline">Cancelar</button>}</h4><div className="space-y-3"><div className="grid grid-cols-2 gap-2"><div><label className="text-xs text-gray-500 font-bold">Emisión</label><input type="date" className="w-full p-2 border rounded text-sm bg-white" value={formCobro.fechaEmision} onChange={e => setFormCobro({...formCobro, fechaEmision: e.target.value})} /></div><div><label className="text-xs text-blue-600 font-bold">Efectiva</label><input type="date" className="w-full p-2 border rounded text-sm bg-white border-blue-200" value={formCobro.fechaEfectiva} onChange={e => setFormCobro({...formCobro, fechaEfectiva: e.target.value})} /></div></div><div><label className="text-xs text-gray-500 font-bold">Importe</label><input type="number" className="w-full p-2 border rounded font-bold text-blue-700 text-lg" placeholder="$ 0.00" value={formCobro.importe} onChange={e => setFormCobro({...formCobro, importe: e.target.value})} /></div>
                  
                  {modalCobro.tipo === 'Venta' && (
                    <div className="bg-white p-3 rounded border border-gray-200 space-y-2"><p className="text-xs font-bold text-gray-400 uppercase border-b pb-1 mb-2">Retenciones (Sufridas)</p><div className="grid grid-cols-3 gap-2"><div><label className="text-[10px] text-gray-500">Gan.</label><input type="number" className="w-full p-1 border rounded text-xs" value={formCobro.retGanancias} onChange={e => setFormCobro({...formCobro, retGanancias: e.target.value})} /></div><div><label className="text-[10px] text-gray-500">IVA</label><input type="number" className="w-full p-1 border rounded text-xs" value={formCobro.retIva} onChange={e => setFormCobro({...formCobro, retIva: e.target.value})} /></div><div><label className="text-[10px] text-gray-500">IIBB</label><input type="number" className="w-full p-1 border rounded text-xs" value={formCobro.retIibb} onChange={e => setFormCobro({...formCobro, retIibb: e.target.value})} /></div></div></div>
                  )}

                  <input type="text" className="w-full p-2 border rounded text-sm" placeholder="Nota..." value={formCobro.nota} onChange={e => setFormCobro({...formCobro, nota: e.target.value})} /><button onClick={guardarMovimientoCompleto} className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 transition">{movimientoEdicion ? 'Guardar Cambios' : 'Registrar'}</button></div></div><div className="space-y-3"><h4 className="font-bold text-gray-700 text-sm">Historial de Pagos</h4><div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">{modalCobro.movimientos_caja && modalCobro.movimientos_caja.map((mov) => (<div key={mov.id} className="p-3 rounded-lg border text-sm flex justify-between items-center bg-white border-gray-100 shadow-sm"><div><p className="font-bold text-gray-800">${Number(mov.importe).toLocaleString()}</p><p className="text-xs text-gray-500">{new Date(mov.fecha_pago).toLocaleDateString()} {mov.fecha_pago !== mov.fecha_efectiva && <span className="text-blue-500">➜ Efec: {new Date(mov.fecha_efectiva).toLocaleDateString()}</span>}</p>{(mov.ret_ganancias > 0 || mov.ret_iva > 0 || mov.ret_iibb > 0) && modalCobro.tipo === 'Venta' && <p className="text-[10px] text-orange-600 mt-1">Retenciones: {mov.ret_ganancias > 0 && `G: ${mov.ret_ganancias} `} {mov.ret_iva > 0 && `I: ${mov.ret_iva} `}</p>}</div><div className="flex gap-2"><button onClick={() => prepararEdicion(mov)} className="text-blue-600">✎</button><button onClick={() => borrarMovimiento(mov.id)} className="text-red-400">🗑</button></div></div>))}</div></div></div><div className="p-4 border-t bg-gray-50 flex justify-end"><button onClick={() => setModalCobro(null)} className="px-6 py-2 bg-white border border-gray-300 rounded font-bold text-gray-600 hover:bg-gray-100">Cerrar</button></div></div></div>)}
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
    </>
  ); 
};

export default App;