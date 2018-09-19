var pg = require('pg');
var pt = require('./peticiones')

var nodemailer = require('nodemailer')

var diasDeLaSemana = ['sudapo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

var transporter = nodemailer.createTransport({
		service: 'Mailgun',
		auth: {
			user: 'postmaster@sandboxbfd316c13dde4a9dab861546ffd36ce9.mailgun.org', // postmaster@sandbox[base64 string].mailgain.org
			pass: 'xdloljuisio69' // You set this.
		}
	});

var debug = false

console.log("SCHEDULING RESERVAS")

var exact_min = 59

checkTime(exact_min);
	
if (debug)
	console.log("DEBUG")

function checkTime(exact_min) {
	if (new Date().getMinutes() == exact_min)
		verDisponibilidad()
	else{
		setTimeout(checkTime, 3000, exact_min);
	}
}

function getWaitTime(exact_min) {
	let date = new Date()
	
	if (exact_min == 0)
		date.setHours(date.getHours() + 1)
	
	date.setMinutes(exact_min % 60)
	date.setSeconds(0)
	date.setMilliseconds(0)

	console.log(date)

	return date - new Date();
}

//Fecha real española
var realDate;

function verDisponibilidad() {
	console.log("Conectando a base de datos");
	pg.connect(process.env.DATABASE_URL, function (err, client, done) {
		if (err) {
			console.log("ERROR AL CONECTAR A LA BASE DE DATOS POR LA NIT");
		} else {
			client.query("SELECT programacion, token, email FROM reservas WHERE programacion NOT LIKE '[]'", function (err, result) {
				done();
				if (err) {
					console.log("ERROR AL EFECTUAR LA QUERY DE LA NIT");
				} else {
					//Calculamos fecha del día siguiente por desfase de hora
					realDate = new Date();
					if (realDate.getHours() > 8)
						realDate.setDate(realDate.getDate() + 1)
						console.log("Real date: " + realDate.getDate())

						var reservas_fallidas = []
						var mailOptions = []

						result.rows.forEach(function (usuario) {
							mailOptions[usuario.email] = {
								from: 'crossfit-heces@megustacomermierda.com',
								to: 'bolito2hd@gmail.com',
								subject: 'Informe reservas',
								text: ''
							}

							mailOptions[usuario.email].to = usuario.email;
							if (usuario.email == 'oscar_alvarez62@hotmail.es')
								mailOptions[usuario.email].to = 'bolito2hd@gmail.com';

							//Inicializar
							reservas_fallidas[usuario.email] = 0

								JSON.parse(usuario.programacion).forEach(function (reserva) {
									var fechaReserva = new Date(realDate);
									var diferencia = reserva.dia - fechaReserva.getDay();
									if (diferencia >= 0)
										fechaReserva.setDate(fechaReserva.getDate() + diferencia);
									else
										fechaReserva.setDate(fechaReserva.getDate() + diferencia + 7);

									var fechaObj = toFechaObj(fechaReserva)
									
									var encontrada = false;
									
									pt.disponibilidad(usuario.token, fechaObj, function (body) {
										var info = "-realdate: " + realDate.getDate() + ",dayofweek: " + realDate.getDay() + ",diferencia: " + diferencia + ", idCrossfit: 92874\n\n";

										for (var i = 0; i < body.d.zones.length; i++) {
											for (var j = 0; j < body.d.zones[i].datas.length; j++) {
												var data = body.d.zones[i].datas[j];
												
												info += '-idActividad: ' + data.idActividad + ', hora actividad: ' + data.hora.hours + ':' + data.hora.minutes + '\n';

												//Hay cross a esta hora
												if (data.idActividad == 92874 && data.hora.hours == reserva.hora && data.hora.minutes == reserva.minuto) {
													encontrada = true
													
													var sesion = {
														'idHorarioActividad': data.idHorarioActividad,
														"fecha": {
															"hora": data.hora.hours,
															"minuto": data.hora.minutes,
															"ano": data.yearSelected,
															"mes": data.monthSelected,
															"dia": data.daySelected
														}
													};

													if (parseInt(sesion.fecha.dia) == realDate.getDate()){
														setTimeout(reservarSesion, getWaitTime(0), sesion, usuario, reservas_fallidas, mailOptions, true)
													}
													else
														reservarSesion(sesion, usuario, reservas_fallidas, mailOptions, false)
													break;
												}
											}
										}
										if (!encontrada) {
											mailOptions[usuario.email].text += "La reserva del dia " + sesion.fecha.dia + " a las " + sesion.fecha.hora + ":" + sesion.fecha.minuto + " ha fallado ya que no existe. Igual está cerrado el gym o han cambiado la hora.\n\n\nInfo extra de reservas disponibles ese día:\n\n" + info + "\n_____________________________\n\n";

											reservas_fallidas[usuario.email]++
										}
									});
								});
						});
				}
			});
		}
	});
}

function toFechaObj(fecha){
	var dia = fecha.getDate();
	if (dia < 10)
		dia = '0' + dia.toString();
	else
		dia = dia.toString();

	var mes = fecha.getMonth() + 1;
	if (mes < 10)
		mes = '0' + mes.toString();
	else
		mes = mes.toString();

	var ano = fecha.getFullYear().toString();

	return {
		"mes": mes,
		"dia": dia,
		"ano": ano
	};
}


function reservarSesion(sesion, usuario, reservas_fallidas, mailOptions, mandar_email) {	
	if(mandar_email){
		console.log("-Empezando reserva para " + usuario.email.toString() + " a los " + new Date().getSeconds() + ":" + new Date().getMilliseconds());
		
		//Pasar la fecha a la semana siguiente
		let fechaReserva = new Date(parseInt(sesion.fecha.ano), parseInt(sesion.fecha.mes) - 1, parseInt(sesion.fecha.dia), 0, 0, 0, 0)
		fechaReserva.setDate(fechaReserva.getDate() + 7)
		
		sesion.fecha.dia = fechaReserva.getDate()
		sesion.fecha.mes = fechaReserva.getMonth() + 1
		sesion.fecha.ano = fechaReserva.getFullYear()
	}
	
	pt.reservarCB(function (code, message) {
		if (code != 0 && code != 410) {
			mailOptions[usuario.email].text += "La reserva del dia " + sesion.fecha.dia + " a las " + sesion.fecha.hora + ":" + sesion.fecha.minuto + " ha fallado con el siguiente mensaje:\n" + message + "\n_____________________________\n\n";
			
			reservas_fallidas[usuario.email]++
		}
		if (code == 0) {
			mailOptions[usuario.email].text += "RESERVAS CORRECTAS:\n\nLa reserva del dia " + sesion.fecha.dia + " a las " + sesion.fecha.hora + ":" + sesion.fecha.minuto + " se ha realizado correctamente con el siguiente mensaje:\n" + message + "\n_____________________________\n\n";
		}
		if (mandar_email) {
			console.log("-Reservas acabadas para " + usuario.email.toString() + "a los " + new Date().getSeconds() + ":" + new Date().getMilliseconds());

			if(reservas_fallidas[usuario.email] > 0)
				mailOptions[usuario.email].text = "RESERVAS FALLIDAS: \n\n" + mailOptions[usuario.email].text;

			if (reservas_fallidas[usuario.email] == 1)
				mailOptions[usuario.email].subject = reservas_fallidas[usuario.email].toString() + ' RESERVA FALLIDAS'
			else
				mailOptions[usuario.email].subject = reservas_fallidas[usuario.email].toString() + ' RESERVAS FALLIDAS'

			if (!debug || usuario.email == 'oscar_alvarez62@hotmail.es') {
				transporter.sendMail(mailOptions[usuario.email], function (error, info) {
					if (error) {
						console.log(error);
					} else {
						console.log('Email sent: ' + info.response);
					}
				});
			}
		}
	}, sesion, usuario.token);
}
