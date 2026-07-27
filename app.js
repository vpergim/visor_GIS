"use strict";

const elementos = {
  ccaa: document.getElementById("ccaa"),
  provincia: document.getElementById("provincia"),
  municipio: document.getElementById("municipio"),
  municipiosLista: document.getElementById("municipios-lista"),
  distrito: document.getElementById("distrito"),
  distritoControl: document.getElementById("distrito-control"),
  variable: document.getElementById("variable"),
  sexo: document.getElementById("sexo"),
  reset: document.getElementById("reset"),
  metodologia: document.getElementById("metodologia"),
  metodologiaModal: document.getElementById("metodologia-modal"),
  cerrarMetodologia: document.getElementById("cerrar-metodologia"),
  status: document.getElementById("status")
};

const VISTA_INICIAL = {
  centro: [-3.7, 40.2],
  zoom: 5.5
};

const IDS = {
  overviewSourcePrefix: "vista-nacional-source-",
  overviewLayerPrefix: "vista-nacional-layer-",
  ccaaSource: "ccaa-source",
  ccaaFill: "ccaa-fill",
  ccaaOutline: "ccaa-outline",
  source: "secciones-source",
  fill: "secciones-fill",
  outline: "secciones-outline"
};

const COLORES = [
  "#d73027",
  "#fc8d59",
  "#fee08b",
  "#d9ef8b",
  "#91cf60",
  "#1a9850"
];

const ETIQUETAS_VARIABLE = {
  V1: "Esperanza vida [2010-2019]",
  V2: "Esperanza vida [2010-2014]",
  V3: "Esperanza vida [2015-2019]"
};

const ETIQUETAS_SEXO = {
  H: "Hombres",
  M: "Mujeres"
};

const FORMATEADOR_NUMERO = new Intl.NumberFormat(
  "es-ES",
  {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }
);

const mapa = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/positron",
  center: VISTA_INICIAL.centro,
  zoom: VISTA_INICIAL.zoom,
  attributionControl: true
});

mapa.addControl(
  new maplibregl.NavigationControl(),
  "top-right"
);

mapa.addControl(
  new maplibregl.ScaleControl({
    maxWidth: 120,
    unit: "metric"
  }),
  "bottom-left"
);

const tooltip = new maplibregl.Popup({
  closeButton: false,
  closeOnClick: false,
  className: "hover-tooltip",
  offset: 8
});

let indice = null;
let escalas = null;
let distritos = null;
let vistaNacional = null;
let geojsonCcaa = null;
let geojsonMunicipio = null;
let municipiosDisponibles = [];
let eventosRegistrados = false;
let idHover = null;
let leyendaElemento = null;

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ordenarTexto(a, b) {
  return String(a).localeCompare(
    String(b),
    "es",
    {
      sensitivity: "base",
      numeric: true
    }
  );
}

function reiniciarSelect(
  select,
  textoInicial,
  deshabilitado = true
) {
  select.innerHTML = "";

  const option = document.createElement("option");
  option.value = "";
  option.textContent = textoInicial;

  select.appendChild(option);
  select.disabled = deshabilitado;
}

function rellenarSelect(
  select,
  opciones,
  textoInicial
) {
  reiniciarSelect(select, textoInicial, false);

  opciones.forEach((opcion) => {
    const item = document.createElement("option");

    if (typeof opcion === "string") {
      item.value = opcion;
      item.textContent = opcion;
    } else {
      item.value = opcion.codigo;
      item.textContent = opcion.etiqueta ?? opcion.nombre;
    }

    select.appendChild(item);
  });
}

function reiniciarMunicipios() {
  elementos.municipio.value = "";
  elementos.municipio.disabled = true;
  elementos.municipiosLista.innerHTML = "";
  municipiosDisponibles = [];
}

function rellenarMunicipios(municipios) {
  reiniciarMunicipios();

  municipiosDisponibles = municipios
    .slice()
    .sort((a, b) => ordenarTexto(a.nombre, b.nombre));

  municipiosDisponibles.forEach((municipio) => {
    const option = document.createElement("option");
    option.value = municipio.nombre;
    elementos.municipiosLista.appendChild(option);
  });

  elementos.municipio.disabled = false;
}

function codigoMunicipioEscrito() {
  const texto = elementos.municipio.value.trim();

  const coincidencia = municipiosDisponibles.find(
    (municipio) => municipio.nombre === texto
  );

  return coincidencia?.codigo ?? null;
}

function abrirMetodologia() {
  elementos.metodologiaModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  elementos.cerrarMetodologia.focus();
}

function cerrarMetodologia() {
  elementos.metodologiaModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  elementos.metodologia.focus();
}

function campoSeleccionado() {
  return `${elementos.variable.value}_${elementos.sexo.value}`;
}

function gradienteLeyenda() {
  const pasos = COLORES.map(
    (color, indice) => {
      const porcentaje =
        (indice / (COLORES.length - 1)) * 100;

      return `${color} ${porcentaje}%`;
    }
  );

  return `linear-gradient(to right, ${pasos.join(", ")})`;
}

function formatearNumero(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero)
    ? FORMATEADOR_NUMERO.format(numero)
    : "";
}

function etiquetaVariable(codigo) {
  return ETIQUETAS_VARIABLE[codigo] ?? codigo;
}

function etiquetaSexo(codigo) {
  return ETIQUETAS_SEXO[codigo] ?? codigo;
}

function etiquetaDistrito(propiedades) {
  const codigoMunicipio = String(
    propiedades.COD_MUNICIPIO ?? ""
  ).padStart(5, "0");

  const codigoDistrito = String(
    propiedades.DISTRITO ?? ""
  ).padStart(2, "0");

  const opcion = distritos?.[codigoMunicipio]?.find(
    (x) => String(x.codigo).padStart(2, "0") === codigoDistrito
  );

  return opcion?.etiqueta ?? codigoDistrito;
}

function construirFicha(propiedades) {
  const filas = ["V1", "V2", "V3"]
    .map(
      (variable) => `
        <tr>
          <td>${escaparHtml(etiquetaVariable(variable))}</td>
          <td>${escaparHtml(formatearNumero(propiedades[`${variable}_H`]))}</td>
          <td>${escaparHtml(formatearNumero(propiedades[`${variable}_M`]))}</td>
        </tr>`
    )
    .join("");

  const distrito = propiedades.DISTRITO
    ? `
      <p>
        <strong>Distrito:</strong>
        ${escaparHtml(etiquetaDistrito(propiedades))}
      </p>`
    : "";

  return `
    <div class="ficha">
      <h3>
        Sección censal ${escaparHtml(propiedades.SECCION)}
      </h3>

      <p>
        <strong>Comunidad autónoma:</strong>
        ${escaparHtml(propiedades.CCAA)}
      </p>

      <p>
        <strong>Provincia:</strong>
        ${escaparHtml(propiedades.PROVINCIA)}
      </p>

      <p>
        <strong>Municipio:</strong>
        ${escaparHtml(propiedades.MUNICIPIO)}
      </p>

      ${distrito}

      <table>
        <thead>
          <tr>
            <th>Variable</th>
            <th>Hombres</th>
            <th>Mujeres</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

function geojsonFiltrado() {
  if (!geojsonMunicipio) {
    return null;
  }

  const codigoDistrito = elementos.distrito.value;

  if (!codigoDistrito) {
    return geojsonMunicipio;
  }

  return {
    ...geojsonMunicipio,
    features: geojsonMunicipio.features.filter(
      (feature) =>
        String(feature.properties.DISTRITO).padStart(2, "0") ===
        codigoDistrito
    )
  };
}

function expresionColor(campo) {
  const limites = escalas[campo];
  const min = Number(limites.min);
  const max = Number(limites.max);

  if (min === max) {
    return COLORES[Math.floor(COLORES.length / 2)];
  }

  const expresion = [
    "interpolate",
    ["linear"],
    ["to-number", ["get", campo], min]
  ];

  COLORES.forEach((color, indice) => {
    const proporcion =
      indice / (COLORES.length - 1);

    const valor =
      min + proporcion * (max - min);

    expresion.push(valor, color);
  });

  return expresion;
}

function actualizarLeyenda(campo) {
  if (leyendaElemento) {
    leyendaElemento.remove();
  }

  const limites = escalas[campo];

  leyendaElemento = document.createElement("div");
  leyendaElemento.className = "legend maplibregl-ctrl";
  leyendaElemento.innerHTML = `
    <strong>
      ${escaparHtml(
        `${etiquetaVariable(elementos.variable.value)} · ` +
        etiquetaSexo(elementos.sexo.value)
      )}
    </strong>
    <div class="legend-gradient" style="background: ${gradienteLeyenda()}"></div>
    <div class="legend-labels">
      <span>${escaparHtml(formatearNumero(limites.min))}</span>
      <span>${escaparHtml(formatearNumero(limites.max))}</span>
    </div>`;

  const contenedor = mapa
    .getContainer()
    .querySelector(".maplibregl-ctrl-bottom-right");

  contenedor.prepend(leyendaElemento);
}

function idsVistaNacional() {
  const imagenes = vistaNacional?.imagenes ?? [];

  return imagenes.map((_, indiceImagen) => ({
    source: `${IDS.overviewSourcePrefix}${indiceImagen}`,
    layer: `${IDS.overviewLayerPrefix}${indiceImagen}`
  }));
}

function eliminarLimitesCcaa() {
  [IDS.ccaaOutline, IDS.ccaaFill].forEach((id) => {
    if (mapa.getLayer(id)) {
      mapa.removeLayer(id);
    }
  });

  if (mapa.getSource(IDS.ccaaSource)) {
    mapa.removeSource(IDS.ccaaSource);
  }
}

function eliminarVistaNacional() {
  idsVistaNacional().forEach(({ source, layer }) => {
    if (mapa.getLayer(layer)) {
      mapa.removeLayer(layer);
    }

    if (mapa.getSource(source)) {
      mapa.removeSource(source);
    }
  });

  eliminarLimitesCcaa();
}

function limitesVistaNacional() {
  const imagenes = vistaNacional?.imagenes ?? [];

  if (imagenes.length === 0) {
    return null;
  }

  const oeste = Math.min(
    ...imagenes.map((imagen) => Number(imagen.bounds.oeste))
  );
  const sur = Math.min(
    ...imagenes.map((imagen) => Number(imagen.bounds.sur))
  );
  const este = Math.max(
    ...imagenes.map((imagen) => Number(imagen.bounds.este))
  );
  const norte = Math.max(
    ...imagenes.map((imagen) => Number(imagen.bounds.norte))
  );

  return [[oeste, sur], [este, norte]];
}

function ajustarVistaNacional(animar = false) {
  const limites = limitesVistaNacional();

  if (!limites) {
    mapa.jumpTo({
      center: VISTA_INICIAL.centro,
      zoom: VISTA_INICIAL.zoom,
      bearing: 0,
      pitch: 0
    });
    return;
  }

  mapa.fitBounds(
    limites,
    {
      padding: {
        top: 35,
        right: 35,
        bottom: 35,
        left: 35
      },
      bearing: 0,
      pitch: 0,
      duration: animar ? 700 : 0
    }
  );
}

function primeraCapaEtiquetas() {
  return (mapa.getStyle().layers ?? []).find(
    (capa) => capa.type === "symbol"
  )?.id;
}

function mostrarLeyendaNacional() {
  if (leyendaElemento) {
    leyendaElemento.remove();
  }

  leyendaElemento = document.createElement("div");
  leyendaElemento.className = "legend maplibregl-ctrl";
  leyendaElemento.innerHTML = `
    <strong>
      ${escaparHtml(
        `${vistaNacional.variable} · ${vistaNacional.sexo}`
      )}
    </strong>
    <div class="legend-gradient" style="background: ${gradienteLeyenda()}"></div>
    <div class="legend-labels">
      <span>${escaparHtml(formatearNumero(vistaNacional.min))}</span>
      <span>${escaparHtml(formatearNumero(vistaNacional.max))}</span>
    </div>`;

  mapa
    .getContainer()
    .querySelector(".maplibregl-ctrl-bottom-right")
    .prepend(leyendaElemento);
}

function mostrarVistaNacional() {
  if (!vistaNacional || !mapa.isStyleLoaded()) {
    return;
  }

  eliminarVistaNacional();

  const antesDe = primeraCapaEtiquetas();

  vistaNacional.imagenes.forEach((imagen, indiceImagen) => {
    const source = `${IDS.overviewSourcePrefix}${indiceImagen}`;
    const layer = `${IDS.overviewLayerPrefix}${indiceImagen}`;
    const b = imagen.bounds;

    mapa.addSource(source, {
      type: "image",
      url: `data/${imagen.archivo}`,
      coordinates: [
        [b.oeste, b.norte],
        [b.este, b.norte],
        [b.este, b.sur],
        [b.oeste, b.sur]
      ]
    });

    mapa.addLayer(
      {
        id: layer,
        type: "raster",
        source,
        paint: {
          "raster-opacity": 0.86,
          "raster-fade-duration": 0,
          "raster-resampling": "nearest"
        }
      },
      antesDe
    );
  });

  if (geojsonCcaa) {
    mapa.addSource(IDS.ccaaSource, {
      type: "geojson",
      data: geojsonCcaa
    });

    mapa.addLayer(
      {
        id: IDS.ccaaFill,
        type: "fill",
        source: IDS.ccaaSource,
        paint: {
          "fill-color": "#000000",
          "fill-opacity": 0
        }
      },
      antesDe
    );

    mapa.addLayer(
      {
        id: IDS.ccaaOutline,
        type: "line",
        source: IDS.ccaaSource,
        paint: {
          "line-color": "#4b5563",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.8,
            8,
            1.6
          ],
          "line-opacity": 0.9
        }
      },
      antesDe
    );
  }

  mostrarLeyendaNacional();
}

function eliminarCapasSecciones() {
  tooltip.remove();

  if (
    idHover !== null &&
    mapa.getSource(IDS.source)
  ) {
    mapa.setFeatureState(
      {
        source: IDS.source,
        id: idHover
      },
      {
        hover: false
      }
    );
  }

  idHover = null;

  [IDS.outline, IDS.fill].forEach((id) => {
    if (mapa.getLayer(id)) {
      mapa.removeLayer(id);
    }
  });

  if (mapa.getSource(IDS.source)) {
    mapa.removeSource(IDS.source);
  }

  if (leyendaElemento) {
    leyendaElemento.remove();
    leyendaElemento = null;
  }
}

function calcularBbox(geojson) {
  let oeste = Infinity;
  let sur = Infinity;
  let este = -Infinity;
  let norte = -Infinity;

  function visitar(coordenadas) {
    if (
      Array.isArray(coordenadas) &&
      typeof coordenadas[0] === "number"
    ) {
      const [lon, lat] = coordenadas;
      oeste = Math.min(oeste, lon);
      sur = Math.min(sur, lat);
      este = Math.max(este, lon);
      norte = Math.max(norte, lat);
      return;
    }

    coordenadas.forEach(visitar);
  }

  geojson.features.forEach((feature) => {
    visitar(feature.geometry.coordinates);
  });

  return [[oeste, sur], [este, norte]];
}

function registrarEventosMapa() {
  if (eventosRegistrados) {
    return;
  }

  mapa.on("mousemove", IDS.fill, (evento) => {
    if (!evento.features?.length) {
      return;
    }

    const feature = evento.features[0];

    if (idHover !== feature.id) {
      if (idHover !== null) {
        mapa.setFeatureState(
          {
            source: IDS.source,
            id: idHover
          },
          {
            hover: false
          }
        );
      }

      idHover = feature.id;

      mapa.setFeatureState(
        {
          source: IDS.source,
          id: idHover
        },
        {
          hover: true
        }
      );
    }

    mapa.getCanvas().style.cursor = "pointer";

    tooltip
      .setLngLat(evento.lngLat)
      .setHTML(
        `Sección censal: ${
          escaparHtml(feature.properties.SECCION)
        }`
      )
      .addTo(mapa);
  });

  mapa.on("mouseleave", IDS.fill, () => {
    if (idHover !== null) {
      mapa.setFeatureState(
        {
          source: IDS.source,
          id: idHover
        },
        {
          hover: false
        }
      );
    }

    idHover = null;
    mapa.getCanvas().style.cursor = "";
    tooltip.remove();
  });

  mapa.on("click", IDS.fill, (evento) => {
    if (!evento.features?.length) {
      return;
    }

    const feature = evento.features[0];

    new maplibregl.Popup({
      maxWidth: "390px"
    })
      .setLngLat(evento.lngLat)
      .setHTML(
        construirFicha(feature.properties)
      )
      .addTo(mapa);
  });

  eventosRegistrados = true;
}

function dibujarMapa(ajustarZoom = false) {
  const geojsonOriginal = geojsonFiltrado();

  if (!geojsonOriginal || !escalas || !mapa.isStyleLoaded()) {
    return;
  }

  const geojson = geojsonOriginal;
  const campo = campoSeleccionado();

  eliminarVistaNacional();
  eliminarCapasSecciones();

  mapa.addSource(IDS.source, {
    type: "geojson",
    data: geojson,
    generateId: true
  });

  mapa.addLayer({
    id: IDS.fill,
    type: "fill",
    source: IDS.source,
    paint: {
      "fill-color": expresionColor(campo),
      "fill-opacity": 0.88
    }
  });

  mapa.addLayer({
    id: IDS.outline,
    type: "line",
    source: IDS.source,
    paint: {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        "#ff4d00",
        expresionColor(campo)
      ],
      "line-width": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        3,
        0.35
      ],
      "line-opacity": 1
    }
  });

  registrarEventosMapa();
  actualizarLeyenda(campo);

  if (ajustarZoom && geojson.features.length > 0) {
    mapa.fitBounds(
      calcularBbox(geojson),
      {
        padding: 35,
        maxZoom: 15,
        duration: 700
      }
    );
  }

  elementos.status.textContent =
    `${geojson.features.length} secciones censales mostradas.`;
}

function configurarDistritos(codigoMunicipio) {
  const opciones = distritos[codigoMunicipio];

  if (!opciones) {
    elementos.distritoControl.classList.add("hidden");

    reiniciarSelect(
      elementos.distrito,
      "Todos los distritos",
      true
    );

    return;
  }

  elementos.distritoControl.classList.remove("hidden");

  rellenarSelect(
    elementos.distrito,
    opciones
      .slice()
      .sort((a, b) => ordenarTexto(a.codigo, b.codigo)),
    "Todos los distritos"
  );
}

async function cargarMunicipio(codigoMunicipio) {
  elementos.status.textContent =
    "Cargando secciones censales...";

  elementos.variable.disabled = true;
  elementos.sexo.disabled = true;

  configurarDistritos(codigoMunicipio);

  try {
    const respuesta = await fetch(
      `data/municipios/${
        encodeURIComponent(codigoMunicipio)
      }.geojson`
    );

    if (!respuesta.ok) {
      throw new Error(`HTTP ${respuesta.status}`);
    }

    geojsonMunicipio = await respuesta.json();

    elementos.variable.disabled = false;
    elementos.sexo.disabled = false;

    dibujarMapa(true);
  } catch (error) {
    console.error(error);
    elementos.status.textContent =
      "No se pudo cargar el municipio.";
  }
}

function restablecerVisor() {
  rellenarSelect(
    elementos.ccaa,
    Object.keys(indice).sort(ordenarTexto),
    "Seleccione..."
  );

  reiniciarSelect(
    elementos.provincia,
    "Seleccione...",
    true
  );

  reiniciarMunicipios();

  reiniciarSelect(
    elementos.distrito,
    "Todos los distritos",
    true
  );

  elementos.distritoControl.classList.add("hidden");

  elementos.variable.value = "V1";
  elementos.sexo.value = "H";
  elementos.variable.disabled = true;
  elementos.sexo.disabled = true;

  geojsonMunicipio = null;
  eliminarCapasSecciones();

  mostrarVistaNacional();
  ajustarVistaNacional(true);

  elementos.status.textContent =
    "Vista nacional. Seleccione una comunidad autónoma para explorar el detalle.";
}

function contieneReferenciaNombre(valor) {
  if (typeof valor === "string") {
    return valor.includes("name");
  }

  if (Array.isArray(valor)) {
    return valor.some(contieneReferenciaNombre);
  }

  return false;
}

function aplicarEtiquetasEspanol() {
  const capas = mapa.getStyle().layers ?? [];

  capas.forEach((capa) => {
    if (capa.type !== "symbol") {
      return;
    }

    const campoTexto = capa.layout?.["text-field"];

    if (!campoTexto || !contieneReferenciaNombre(campoTexto)) {
      return;
    }

    try {
      mapa.setLayoutProperty(
        capa.id,
        "text-field",
        [
          "coalesce",
          ["get", "name:es"],
          campoTexto
        ]
      );
    } catch (error) {
      console.debug(
        `No se modificó la etiqueta de ${capa.id}`,
        error
      );
    }
  });
}

elementos.ccaa.addEventListener("change", () => {
  reiniciarSelect(
    elementos.provincia,
    "Seleccione..."
  );

  reiniciarSelect(
    elementos.municipio,
    "Seleccione..."
  );

  reiniciarSelect(
    elementos.distrito,
    "Todos los distritos"
  );

  elementos.distritoControl.classList.add("hidden");
  elementos.variable.disabled = true;
  elementos.sexo.disabled = true;
  geojsonMunicipio = null;

  eliminarCapasSecciones();

  if (!elementos.ccaa.value) {
    mostrarVistaNacional();
    return;
  }

  rellenarSelect(
    elementos.provincia,
    Object.keys(
      indice[elementos.ccaa.value]
    ).sort(ordenarTexto),
    "Seleccione..."
  );
});

elementos.provincia.addEventListener("change", () => {
  reiniciarSelect(
    elementos.municipio,
    "Seleccione..."
  );

  reiniciarSelect(
    elementos.distrito,
    "Todos los distritos"
  );

  elementos.distritoControl.classList.add("hidden");
  elementos.variable.disabled = true;
  elementos.sexo.disabled = true;

  if (!elementos.provincia.value) {
    return;
  }

  rellenarMunicipios(
    indice[elementos.ccaa.value][elementos.provincia.value]
  );
});

function aplicarMunicipioEscrito() {
  const codigoMunicipio = codigoMunicipioEscrito();

  if (!codigoMunicipio) {
    elementos.variable.disabled = true;
    elementos.sexo.disabled = true;
    elementos.distritoControl.classList.add("hidden");
    eliminarCapasSecciones();

    if (elementos.municipio.value.trim()) {
      elementos.status.textContent =
        "Seleccione un municipio de la lista de sugerencias.";
    }

    return;
  }

  cargarMunicipio(codigoMunicipio);
}

elementos.municipio.addEventListener(
  "change",
  aplicarMunicipioEscrito
);

elementos.municipio.addEventListener(
  "keydown",
  (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      aplicarMunicipioEscrito();
    }
  }
);

elementos.distrito.addEventListener(
  "change",
  () => dibujarMapa(true)
);

elementos.variable.addEventListener(
  "change",
  () => dibujarMapa(false)
);

elementos.sexo.addEventListener(
  "change",
  () => dibujarMapa(false)
);

elementos.reset.addEventListener(
  "click",
  restablecerVisor
);

elementos.metodologia.addEventListener(
  "click",
  abrirMetodologia
);

elementos.cerrarMetodologia.addEventListener(
  "click",
  cerrarMetodologia
);

elementos.metodologiaModal.addEventListener(
  "click",
  (evento) => {
    if (evento.target === elementos.metodologiaModal) {
      cerrarMetodologia();
    }
  }
);

document.addEventListener(
  "keydown",
  (evento) => {
    if (
      evento.key === "Escape" &&
      !elementos.metodologiaModal.classList.contains("hidden")
    ) {
      cerrarMetodologia();
    }
  }
);

async function cargarDatosAuxiliares() {
  const [
    indiceData,
    escalasData,
    distritosData,
    vistaNacionalData,
    geojsonCcaaData
  ] = await Promise.all([
      fetch("data/indice.json").then((respuesta) => {
        if (!respuesta.ok) {
          throw new Error(
            `Índice: HTTP ${respuesta.status}`
          );
        }

        return respuesta.json();
      }),

      fetch("data/escalas.json").then((respuesta) => {
        if (!respuesta.ok) {
          throw new Error(
            `Escalas: HTTP ${respuesta.status}`
          );
        }

        return respuesta.json();
      }),

      fetch("data/distritos.json").then((respuesta) => {
        if (!respuesta.ok) {
          throw new Error(
            `Distritos: HTTP ${respuesta.status}`
          );
        }
        return respuesta.json();
      }),

      fetch("data/vista_nacional.json").then((respuesta) => {
        if (!respuesta.ok) {
          throw new Error(
            `Vista nacional: HTTP ${respuesta.status}`
          );
        }
        return respuesta.json();
      }),

      fetch("data/ccaa.geojson").then((respuesta) => {
        if (!respuesta.ok) {
          throw new Error(
            `Límites CCAA: HTTP ${respuesta.status}`
          );
        }
        return respuesta.json();
      })
    ]);

  indice = indiceData;
  escalas = escalasData;
  distritos = distritosData;
  vistaNacional = vistaNacionalData;
  geojsonCcaa = geojsonCcaaData;

  rellenarSelect(
    elementos.ccaa,
    Object.keys(indice).sort(ordenarTexto),
    "Seleccione..."
  );

  mostrarVistaNacional();
  ajustarVistaNacional(false);

  elementos.status.textContent =
    "Vista nacional. Seleccione una comunidad autónoma para explorar el detalle.";
}

mapa.on("load", async () => {
  aplicarEtiquetasEspanol();

  try {
    await cargarDatosAuxiliares();
  } catch (error) {
    console.error(error);

    elementos.status.innerHTML =
      window.location.protocol === "file:"
        ? "El visor se ha abierto como archivo local " +
          "(<code>file://</code>). Ábralo mediante un servidor HTTP."
        : "No se pudieron cargar los datos auxiliares del visor.";
  }
});
