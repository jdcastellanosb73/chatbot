const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
require("dotenv").config
const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
//const MongoAdapter = require('@bot-whatsapp/database/mongo') //recordar bloquear el MOckAdapter y pasarlo a mongo DB
const MockAdapter = require('@bot-whatsapp/database/mock')
const path = require("path")
const fs = require("fs")
const chat = require("./chatGPT")
const { handlerAI } = require("./whisper")

const opcionPath = path.join(__dirname, "mensajes", "opciones.txt")
const opciones = fs.readFileSync(opcionPath, "utf8")

//conexion a mongoDB
async function getVacante(nombreVacante) {
    try {
        await client.connect();
        const database = client.db("nombreMongo");
        const collection = database.collection("nombreColeccion");

        // Consulta para encontrar la vacante específica
        const vacante = await collection.findOne({ nombre: nombreVacante });

        return vacante;
    } catch (error) {
        console.error('Error al conectar con MongoDB:', error);
        return null;
    } finally {
        await client.close();
    }
}


// Función que combina la información de MongoDB y ChatGPT
const obtenerInfoVacante = async (nombreVacante, prompt, chat) => {
    const vacante = await getVacante(nombreVacante);

    if (vacante) {
        if (vacante.tipo === 'interna') {
            // Responde con la información encontrada en la base de datos para vacantes internas
            return {
                content: [
                    `🔎 Información de la vacante interna: *${vacante.nombre}*`,
                    `Descripción: ${vacante.descripcion}`,
                    `Requisitos: ${vacante.requisitos}`,
                    `Ubicación: ${vacante.ubicacion}`,
                    `Salario: ${vacante.salario}`,
                ].join('\n'),
                tipo: 'interna'
            };
        } else if (vacante.tipo === 'externa') {
            // Responde con el enlace para vacantes externas
            return {
                content: `🔗 La vacante *${vacante.nombre}* es externa. Puedes aplicar en el siguiente enlace: ${vacante.link}`,
                tipo: 'externa'
            };
        }
    } else {
        // Si no se encuentra la vacante en MongoDB, consulta a ChatGPT
        const consulta = `No se encontró la vacante llamada "${nombreVacante}". ${prompt}`;
        const response = await chat(prompt, consulta);

        if (response === "ERROR") {
            return { content: "Lo siento, ocurrió un error al procesar tu solicitud. Por favor, inténtalo más tarde.", tipo: 'error' };
        } else {
            return { content: response.content, tipo: 'chatgpt' };
        }
    }
};

//variables que se guardan en la base de datos 
let nombreConst;
let emailConst;
let telefonoConst;
let passwordConst;
const tempFiles = {};


    const flowVoice = addKeyword(EVENTS.VOICE_NOTE).addAnswer(null,null, async(ctx,ctxFn) =>{
        const text = await handlerAI(ctx)
        const prompt = promptConsultas
        const consulta = text
        const answer = await chat(prompt, consulta)
        await ctxFn.flowDynamic(answer.content)
    })

    const flowWelcome = addKeyword(EVENTS.WELCOME)
    .addAnswer("Bienvenido a Coally, la plataforma #1 de empleo y talento joven.", {
        delay: 1000, // demora en tiempo para contestar el mensaje.
    },
    async (ctx, ctxFn) => {
        const nombreUsuario = ctx.pushName || "Usuario";
        // Mensaje de bienvenida
        await ctxFn.flowDynamic(`Hola ${nombreUsuario}! Ahora puedes aplicar a la plataforma desde whatsapp si quieres saber de cualquiera de los tres procesos de aplicación porfavor escribe *continuar*.`);
    });

    const optionFlow = addKeyword(["opciones", "Opciones", "continuar", "Continuar"]).addAnswer(
        opciones,
        { capture: true },
        async (ctx, { gotoFlow, fallBack, flowDynamic }) => {
            if (!["1", "2", "3", "0"].includes(ctx.body)) {
                return fallBack(
                    "Respuesta no válida, por favor selecciona una de las opciones."
                );
            }
            switch (ctx.body) {
                case "1":
                    return gotoFlow(flowDatosPersonales);
                case "2":
                    return gotoFlow(flowPreguntasVacantes2);
                case "3":
                    return gotoFlow(flowCV);
                case "0":
                    return await flowDynamic(
                        "Saliendo... Puedes volver a acceder a este menú escribiendo '*Opciones*'"
                    );
            }
        }
    );
    // flow de la primera ruta
    const flowDatosPersonales = addKeyword(['datos', 'Datos'])
    .addAnswer('Por favor, escribe tu nombre completo:', { capture: true }, async (ctx, { flowDynamic, state }) => {
        const nombre = ctx.body;
        await state.update({ nombre });
        nombreConst = nombre; // Guardar en la constante global
        await flowDynamic(`Gracias ${nombreConst}!`);
    })
    .addAnswer('Ahora, escribe tu correo electrónico:', { capture: true }, async (ctx, { flowDynamic, state, fallBack }) => {
        const email = ctx.body;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return fallBack('Por favor, ingresa un correo electrónico válido.');
        }
        await state.update({ email });
        emailConst = email; // Guardar en la constante global
        await flowDynamic('Correo registrado correctamente!');
    })
    .addAnswer('Por favor, escribe tu número de teléfono celular con el indicativo del pais:', { capture: true }, async (ctx, { flowDynamic, state, fallBack }) => {
        const telefono = ctx.body;
        const phoneRegex = /^\d{12}$/;
        if (!phoneRegex.test(telefono)) {
            return fallBack('Por favor, ingresa un número de teléfono válido con su respectivo indicativo (12 dígitos).');
        }
        await state.update({ telefono });
        telefonoConst = telefono; // Guardar en la constante global
        await flowDynamic('Número de teléfono registrado!');
    })
    .addAnswer('Por último, crea una contraseña para tu cuenta:', { capture: true }, async (ctx, { flowDynamic, state, gotoFlow, fallBack }) => {
        const password = ctx.body;
        if (password.length < 8) {
            return fallBack('La contraseña debe tener al menos 8 caracteres.');
        }
        try {
            await state.update({ password });
            passwordConst = password; // Guardar en la constante global
            const currentState = await state.get();
            if (!currentState || !currentState.nombre) {
                await flowDynamic([
                    'Perfecto! Tus datos han sido registrados.',
                    'Ahora procederemos a la selección de vacante...'
                ]);
            } else {
                await flowDynamic([
                    'Perfecto! Hemos registrado tus datos:',
                    `Nombre: ${currentState.nombre}`,
                    `Email: ${currentState.email}`,
                    `Teléfono: ${currentState.telefono}`,
                    'Tu contraseña ha sido guardada de forma segura.',
                    'Ahora procederemos a la selección de vacante...'
                ]);
            }
            return gotoFlow(flowPreguntasVacantes1);
        } catch (error) {
            console.error('Error al procesar los datos:', error);
            await flowDynamic(['Tus datos han sido registrados.', 'Continuaremos con la selección de vacante...']);
            return gotoFlow(flowPreguntasVacantes1);
        }
    });

    /*
    const flowDatosPersonales = addKeyword(['datos', 'Datos'])
    .addAnswer('Por favor, escribe tu nombre completo:', { capture: true }, async (ctx, { flowDynamic, state }) => {
        const nombre = ctx.body;
        await state.update({ nombre });
        nombreConst = nombre; // Guardar en la constante global
        await flowDynamic(`Gracias ${nombreConst}!`);
    })
    .addAnswer('Ahora, escribe tu correo electrónico:', { capture: true }, async (ctx, { flowDynamic, state, fallBack }) => {
        const email = ctx.body;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return fallBack('Por favor, ingresa un correo electrónico válido.');
        }
        await state.update({ email });
        emailConst = email; // Guardar en la constante global
        await flowDynamic('Correo registrado correctamente!');
    })
    .addAnswer('¿Quieres usar el número de teléfono asociado a este WhatsApp? Responde con *SI* o *NO*:', { capture: true }, async (ctx, { flowDynamic, state, fallBack }) => {
        const respuesta = ctx.body.toLowerCase();

        if (respuesta === 'si' || respuesta === 'sí') {
            // Utilizar el número de teléfono del contacto en WhatsApp
            const telefono = ctx.from; // El número de teléfono viene en ctx.from
            await state.update({ telefono });
            telefonoConst = telefono; // Guardar en la constante global
            await flowDynamic(`Número de teléfono registrado: ${telefono}`);
        } else if (respuesta === 'no') {
            // Proceder a solicitar manualmente el número de teléfono
            await flowDynamic('Por favor, escribe tu número de teléfono celular con el indicativo del país:');
            return 'solicitarTelefono'; // Usaremos esta etiqueta para continuar en el próximo paso
        } else {
            // Respuesta no válida, repetir pregunta
            return fallBack('Por favor, responde con *SI* o *NO*.');
        }
    })
    .addAnswer('Por favor, escribe tu número de teléfono celular con el indicativo del país:', { capture: true, childKeyword: 'solicitarTelefono' }, async (ctx, { flowDynamic, state, fallBack }) => {
        const telefono = ctx.body;
        const phoneRegex = /^\d{12}$/;
        if (!phoneRegex.test(telefono)) {
            return fallBack('Por favor, ingresa un número de teléfono válido con su respectivo indicativo (12 dígitos).');
        }
        await state.update({ telefono });
        telefonoConst = telefono; // Guardar en la constante global
        await flowDynamic('Número de teléfono registrado!');
    })
    .addAnswer('Por último, crea una contraseña para tu cuenta:', { capture: true }, async (ctx, { flowDynamic, state, gotoFlow, fallBack }) => {
        const password = ctx.body;
        if (password.length < 8) {
            return fallBack('La contraseña debe tener al menos 8 caracteres.');
        }
        try {
            await state.update({ password });
            passwordConst = password; // Guardar en la constante global
            const currentState = await state.get();
            if (!currentState || !currentState.nombre) {
                await flowDynamic([
                    'Perfecto! Tus datos han sido registrados.',
                    'Ahora procederemos a la selección de vacante...'
                ]);
            } else {
                await flowDynamic([
                    'Perfecto! Hemos registrado tus datos:',
                    `Nombre: ${currentState.nombre}`,
                    `Email: ${currentState.email}`,
                    `Teléfono: ${currentState.telefono}`,
                    'Tu contraseña ha sido guardada de forma segura.',
                    'Ahora procederemos a la selección de vacante...'
                ]);
            }
            return gotoFlow(flowPreguntasVacantes1);
        } catch (error) {
            console.error('Error al procesar los datos:', error);
            await flowDynamic(['Tus datos han sido registrados.', 'Continuaremos con la selección de vacante...']);
            return gotoFlow(flowPreguntasVacantes1);
        }
    });
    */

    const flowPreguntasVacantes2 = addKeyword(['\\¿', '\\?', EVENTS.ACTION])
    .addAnswer('Por favor, escribe el nombre de la vacante que deseas consultar:', { capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
        const nombreVacante = ctx.body; // Captura el nombre de la vacante del mensaje del usuario

        // Mensaje del sistema para establecer el contexto de la consulta en ChatGPT
        const prompt = "Eres un asistente que ayuda a los usuarios a encontrar información sobre vacantes laborales. Responde de forma clara y breve.";

        // Obtenemos la información usando MongoDB y ChatGPT
        const response = await obtenerInfoVacante(nombreVacante, prompt, chat);

        // Enviar la respuesta al usuario
        await flowDynamic(response.content);

        // Si la vacante es externa, pregunta si ya aplicó
        if (response.tipo === 'externa') {
            await flowDynamic('¿Ya has aplicado a esta vacante? Responde con *SI* o *NO*');
        }
    })
    .addAnswer(
        null,
        { capture: true },
        async (ctx, { flowDynamic }) => {
            const respuesta = ctx.body.toLowerCase();

            if (respuesta === 'si' || respuesta === 'sí') {
                await flowDynamic('¡Perfecto! Nos alegra saber que has aplicado. ¡Buena suerte!');
            } else if (respuesta === 'no') {
                await flowDynamic('¡No hay problema! Puedes aplicar cuando estés listo. Si necesitas más información, no dudes en preguntar.');
            } else {
                await flowDynamic('Por favor, responde con *SI* si ya aplicaste o *NO* si aún no lo has hecho.');
            }
        }
    );

    /*const flowPreguntasVacantes2 = addKeyword(['\\¿', '\\?', EVENTS.ACTION])
    .addAnswer('Haz tu pregunta sobre la vacante especifica:', { capture: true }, async (ctx, { flowDynamic }) => {
        const consulta = ctx.body; // Capturamos la pregunta del usuario

        // Mensaje del sistema para establecer el contexto de la consulta
        const prompt = "Eres un asistente que ayuda a los usuarios a encontrar información sobre vacantes laborales. Responde de forma clara y breve.";

        // Llamada a la función `chat` que consulta a OpenAI
        const response = await chat(prompt, consulta);

        if (response === "ERROR") {
            await flowDynamic("Lo siento, ocurrió un error al procesar tu solicitud. Por favor, inténtalo más tarde.");
        } else {
            await flowDynamic(response.content); // Enviamos la respuesta de ChatGPT al usuario
        }
    }); */


    //flowprimeraruta
    const flowPreguntasVacantes1 = addKeyword(EVENTS.ACTION)
    .addAnswer('Haz tu pregunta sobre las vacantes que te interesan:', { capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
        const consulta = ctx.body; // Capturamos la pregunta del usuario

        // Mensaje del sistema para establecer el contexto de la consulta
        const prompt = "Eres un asistente que ayuda a los usuarios a encontrar información sobre vacantes laborales. Responde de forma clara y breve.";

        // Llamada a la función `chat` que consulta a OpenAI
        const response = await chat(prompt, consulta);

        if (response === "ERROR") {
            await flowDynamic("Lo siento, ocurrió un error al procesar tu solicitud. Por favor, inténtalo más tarde.");
        } else {
            await flowDynamic(response.content); // Enviamos la respuesta de ChatGPT al usuario
        }

        // Verificar si la consulta termina con un '?'
        if (consulta.trim().endsWith('?')) {
            // Redirigir al flowCV después de obtener la respuesta
            return gotoFlow(flowCV);
        }
    });

    
    /*const flowCV = addKeyword([])
    .addAnswer(
        [
            '📄 *Proceso de envío de CV*',
            'Por favor, envía tu CV en formato PDF.',
            'Asegúrate de que el documento contenga tu información actualizada.'
        ],
        { capture: true },
        async (ctx, { flowDynamic }) => {
            try {
                // Verificar si el mensaje contiene un archivo (cualquier tipo de documento)
                const hasDocument = ctx.message?.type === 'document';
                
                if (hasDocument) {
                    console.log('Documento recibido:', ctx.message);

                    // Extraer información básica del documento
                    const fileData = {
                        fileName: ctx.message.fileName || 'documento_recibido',
                        fileBuffer: ctx.message.body || ctx.message,
                        mimeType: ctx.message.mimetype,
                        timestamp: new Date().toISOString()
                    };

                    // Guardar temporalmente el archivo
                    tempFiles[ctx.from] = fileData;

                    await flowDynamic([
                        '✅ He recibido tu documento correctamente.',
                        'Por favor, confirma el envío respondiendo *SI* o *NO*'
                    ]);
                } else {
                    return; // Si no es un documento, no hace nada
                }
            } catch (error) {
                console.error('Error al procesar el documento:', error);
                await flowDynamic('❌ Hubo un error al procesar tu archivo. Por favor, intenta nuevamente.');
            }
        }
    )
    .addAnswer(
        null,
        { capture: true },
        async (ctx, { flowDynamic }) => {
            const hasDocument = ctx.message?.type === 'document';

            if (hasDocument) {
                const fileData = {
                    fileName: ctx.message.fileName || 'documento_recibido',
                    fileBuffer: ctx.message.body || ctx.message,
                    mimeType: ctx.message.mimetype,
                    timestamp: new Date().toISOString()
                };
                
                tempFiles[ctx.from] = fileData;

                await flowDynamic([
                    '✅ He recibido tu documento correctamente.',
                    'Por favor, confirma el envío respondiendo *SI* o *NO*'
                ]);
                return;
            }

            const response = ctx.body.toLowerCase();

            if (response === 'si' || response === 'sí') {
                const cvData = tempFiles[ctx.from];
                if (cvData) {
                    try {
                        console.log('Documento confirmado y listo para procesar:', cvData);

                        delete tempFiles[ctx.from];

                        await flowDynamic([
                            '✅ Documento confirmado y guardado exitosamente.',
                            'Gracias por enviar tu documento. Nos pondremos en contacto contigo pronto.'
                        ]);
                    } catch (error) {
                        console.error('Error al guardar el documento:', error);
                        await flowDynamic('❌ Hubo un error al guardar tu documento. Por favor, intenta nuevamente.');
                    }
                } else {
                    await flowDynamic('❌ No se encontró ningún documento para procesar. Por favor, envía tu archivo nuevamente.');
                }
            } else if (response === 'no') {
                delete tempFiles[ctx.from];
                await flowDynamic([
                    '❌ Envío cancelado.',
                    'Puedes enviar tu documento nuevamente cuando lo desees.'
                ]);
            } else {
                await flowDynamic('❓ Por favor, responde *SI* para confirmar o *NO* para cancelar.');
            }
        }
    );*/


const main = async () => {
    /* const adapterDB = new MongoAdapter({
        dburi: process.env.MONGO_DB_URI,
        dbName:"pruebaWhatsApp"
    })*/
    const adapterDB = new MockAdapter()
    const adapterFlow = createFlow([flowWelcome, optionFlow, flowDatosPersonales,flowPreguntasVacantes1, flowPreguntasVacantes2, flowCV, flowVoice])
    const adapterProvider = createProvider(BaileysProvider)

    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    QRPortalWeb()
}

main()
