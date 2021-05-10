import { Request, Response } from "express";

import db from "../database/connection";

import { ScheduleItem } from "../@types";

import { convertHourToMinutes } from "../utils/convertHourToMinutes";

import { ApiError } from "../errors";

export class ClassesController {
  async index(request: Request, response: Response) {
    const filters = request.query;

    const subject = filters.subject as string;
    const week_day = filters.week_day as string;
    const time = filters.time as string;

    if (!filters.week_day || !filters.subject || !filters.time)
      throw new ApiError("Missing filters to search classes", 400);

    const timeInMinutes = convertHourToMinutes(time);

    const classes = await db("classes")
      .whereExists(function () {
        this.select("class_schedule.*")
          .from("class_schedule")
          .whereRaw("`class_schedule` . `class_id` = `classes` . `id`")
          .whereRaw("`class_schedule` . `week_day` = ??", [Number(week_day)])
          .whereRaw("`class_schedule` . `from` <= ??", [timeInMinutes])
          .whereRaw("`class_schedule` . `to` > ??", [timeInMinutes]);
      })
      .where("classes.subject", "=", subject)
      .join("users", "classes.user_id", "=", "users.id")
      .select(["classes.*", "users.*"]);

    return response.status(200).json(classes);
  }

  async create(request: Request, response: Response) {
    const { name, avatar, whatsapp, bio, subject, cost, schedule } =
      request.body;

    const trx = await db.transaction();

    try {
      const insertedUsersIds = await trx("users").insert({
        name,
        avatar,
        whatsapp,
        bio,
      });

      const user_id = insertedUsersIds[0];

      await trx("classes").insert({
        subject,
        cost,
        user_id,
      });

      const class_id = insertedUsersIds[0];

      const classSchedule = schedule.map(
        ({ from, to, week_day }: ScheduleItem) => {
          return {
            class_id,
            week_day: week_day,
            from: convertHourToMinutes(from),
            to: convertHourToMinutes(to),
          };
        }
      );

      await trx("class_schedule").insert(classSchedule);

      await trx.commit();

      return response.status(201).send();
    } catch (err) {
      await trx.rollback();

      throw new ApiError("Unexpected error while creating new class", 500);
    }
  }
}
