import express from "express";
import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../utils/auth-middleware.js";
import { triggerImmediateProcess } from "../jobs/index.js";
import { uploadFields } from "../utils/upload-service.js";
import { createLogger } from "../utils/logger.js";

const router = express.Router();
const log = createLogger("campaigns");

const campaignUpload = uploadFields("", [
  { name: "images", maxCount: 10 },
  { name: "igMedia_FEED", maxCount: 5 },
  { name: "igMedia_STORY", maxCount: 5 },
  { name: "igMedia_REEL", maxCount: 5 },
]);

// ─── Create a new campaign (post + schedule) ─────────────

router.post(
  "/campaigns",
  requireAuth,
  campaignUpload,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    let {
      title,
      text,
      groupIds,
      anonymous,
      location,
      scheduleMode,
      scheduleDate,
      scheduleTime,
      recurringDays,
      recurringTime,
      recurringTimes,
      dayTimes,
      recurringStartDate,
      recurringEndDate,
      campaignType,
      publishToProfile,
      instagramEnabled,
      instagramPublishType,
      instagramPublishTypes,
      igPerTypeSchedules,
      storyMediaMode,
      storyPickedIndex,
      storyCaptions,
      templateName,
      whatsappEnabled,
      whatsappTargets,
      waScheduleMode,
      waScheduleDate,
      waScheduleTime,
      waRecurringDays,
      waDayTimes,
      waRecurringStartDate,
      waRecurringEndDate,
    } = req.body;

    // Parse stringified arrays from FormData
    if (typeof groupIds === "string") groupIds = JSON.parse(groupIds);
    if (typeof recurringDays === "string")
      recurringDays = JSON.parse(recurringDays);
    if (typeof recurringTimes === "string")
      recurringTimes = JSON.parse(recurringTimes);
    if (typeof dayTimes === "string") dayTimes = JSON.parse(dayTimes);
    if (typeof instagramPublishTypes === "string")
      instagramPublishTypes = JSON.parse(instagramPublishTypes);
    if (typeof igPerTypeSchedules === "string")
      igPerTypeSchedules = JSON.parse(igPerTypeSchedules);
    if (anonymous === "true") anonymous = true;
    if (anonymous === "false") anonymous = false;
    if (publishToProfile === "true") publishToProfile = true;
    if (publishToProfile === "false") publishToProfile = false;
    if (instagramEnabled === "true") instagramEnabled = true;
    if (instagramEnabled === "false") instagramEnabled = false;
    if (typeof storyPickedIndex === "string")
      storyPickedIndex = parseInt(storyPickedIndex, 10) || 0;
    if (typeof storyCaptions === "string")
      storyCaptions = JSON.parse(storyCaptions);
    if (whatsappEnabled === "true") whatsappEnabled = true;
    if (whatsappEnabled === "false") whatsappEnabled = false;
    if (typeof whatsappTargets === "string")
      whatsappTargets = JSON.parse(whatsappTargets);
    if (typeof waRecurringDays === "string")
      waRecurringDays = JSON.parse(waRecurringDays);
    if (typeof waDayTimes === "string") waDayTimes = JSON.parse(waDayTimes);

    // Normalize: prefer instagramPublishTypes (array from client) over singular
    if (!instagramPublishType && instagramPublishTypes) {
      instagramPublishType = Array.isArray(instagramPublishTypes)
        ? instagramPublishTypes.join(",")
        : instagramPublishTypes;
    }

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }

    // Allow saving without groups (draft only) — unless publishing to profile, Instagram, or WhatsApp
    if (
      !groupIds?.length &&
      !publishToProfile &&
      !instagramEnabled &&
      !whatsappEnabled &&
      scheduleMode &&
      scheduleMode !== "draft"
    ) {
      return res
        .status(400)
        .json({ error: "groupIds are required for scheduled campaigns" });
    }

    // Determine scheduled datetime
    let scheduledAt = null;
    let recurringScheduledAt = null;

    if (
      (scheduleMode === "scheduled" || scheduleMode === "both") &&
      scheduleDate &&
      scheduleTime
    ) {
      scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);
      if (scheduledAt <= new Date()) {
        return res.status(400).json({ error: "תאריך התזמון חייב להיות בעתיד" });
      }
    }

    if (scheduleMode === "recurring" || scheduleMode === "both") {
      // Use the first available time from recurringTimes array or fallback to recurringTime
      const effectiveTime =
        (recurringTimes?.length && recurringTimes[0]) || recurringTime;
      if (!effectiveTime) {
        return res.status(400).json({ error: "יש לבחור שעת פרסום" });
      }

      const [hours, minutes] = effectiveTime.split(":").map(Number);

      // If recurringStartDate is provided, use it; otherwise compute next occurrence
      if (recurringStartDate) {
        const startDate = new Date(`${recurringStartDate}T${effectiveTime}:00`);
        if (startDate > new Date()) {
          recurringScheduledAt = startDate;
        } else {
          // Start date is today or past — find next occurrence from today
          const now = new Date();
          const today = now.getDay();
          const sortedDays = [...(recurringDays || [])].sort((a, b) => a - b);
          let nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
          let daysUntil =
            nextDay > today ? nextDay - today : 7 - today + nextDay;
          if (nextDay === today) {
            const todayTime = new Date();
            todayTime.setHours(hours, minutes, 0, 0);
            if (todayTime > now) daysUntil = 0;
            else {
              nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
              daysUntil =
                nextDay > today ? nextDay - today : 7 - today + nextDay;
              if (daysUntil === 0) daysUntil = 7;
            }
          }
          recurringScheduledAt = new Date(now);
          recurringScheduledAt.setDate(
            recurringScheduledAt.getDate() + daysUntil,
          );
          recurringScheduledAt.setHours(hours, minutes, 0, 0);
        }
      } else {
        // No start date — compute next occurrence from now
        const now = new Date();
        const today = now.getDay();
        const sortedDays = [...(recurringDays || [])].sort((a, b) => a - b);
        let nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
        let daysUntil = nextDay > today ? nextDay - today : 7 - today + nextDay;
        if (nextDay === today) {
          const todayTime = new Date();
          todayTime.setHours(hours, minutes, 0, 0);
          if (todayTime > now) daysUntil = 0;
          else {
            nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
            daysUntil = nextDay > today ? nextDay - today : 7 - today + nextDay;
            if (daysUntil === 0) daysUntil = 7;
          }
        }
        recurringScheduledAt = new Date(now);
        recurringScheduledAt.setDate(
          recurringScheduledAt.getDate() + daysUntil,
        );
        recurringScheduledAt.setHours(hours, minutes, 0, 0);
      }

      // For pure recurring mode (not both), use recurringScheduledAt as the primary
      if (scheduleMode === "recurring") {
        scheduledAt = recurringScheduledAt;
      }
    }

    // Create the Post
    const post = await prisma.post.create({
      data: {
        userId,
        title: title || null,
        content: text,
        status:
          scheduledAt || recurringScheduledAt || scheduleMode === "now"
            ? "ACTIVE"
            : "DRAFT",
        isAnonymous: anonymous || false,
        location: location || null,
        publishToProfile: publishToProfile || false,
        instagramEnabled: instagramEnabled || false,
        instagramPublishType: instagramEnabled
          ? instagramPublishType || null
          : null,
        storyMediaMode: instagramEnabled ? storyMediaMode || null : null,
        storyPickedIndex: instagramEnabled ? (storyPickedIndex ?? null) : null,
        storyCaptions:
          instagramEnabled && storyCaptions ? storyCaptions : undefined,
        whatsappEnabled: whatsappEnabled || false,
        whatsappTargets:
          whatsappEnabled && whatsappTargets ? whatsappTargets : undefined,
        templateName: templateName || null,
        campaignType: campaignType || "ONE_TIME",
        recurringDays: recurringDays || [],
        recurringTime: recurringTime || recurringTimes?.[0] || null,
        recurringTimes: recurringTimes || [],
        dayTimes: dayTimes || null,
        recurringStart: recurringStartDate
          ? new Date(`${recurringStartDate}T00:00:00`)
          : null,
        recurringEnd: recurringEndDate
          ? new Date(`${recurringEndDate}T23:59:59`)
          : null,
        imageUrl: req.files?.images?.length
          ? `/uploads/${req.files.images[0].filename}`
          : null,
      },
    });

    // Save uploaded images as PostMedia (global)
    if (req.files?.images?.length) {
      for (let i = 0; i < req.files.images.length; i++) {
        await prisma.postMedia.create({
          data: {
            postId: post.id,
            mediaType: req.files.images[i].mimetype?.startsWith("video/")
              ? "VIDEO"
              : "IMAGE",
            url: `/uploads/${req.files.images[i].filename}`,
            orderIndex: i,
          },
        });
      }
    }

    // Save per-IG-type media
    for (const igType of ["FEED", "STORY", "REEL"]) {
      const typeFiles = req.files?.[`igMedia_${igType}`];
      if (typeFiles?.length) {
        for (let i = 0; i < typeFiles.length; i++) {
          await prisma.postMedia.create({
            data: {
              postId: post.id,
              mediaType: typeFiles[i].mimetype?.startsWith("video/")
                ? "VIDEO"
                : "IMAGE",
              url: `/uploads/${typeFiles[i].filename}`,
              orderIndex: i,
              igType,
            },
          });
        }
      }
    }

    // Create PostGroup + Schedule + Job for each group
    const results = [];
    for (const groupId of groupIds || []) {
      // Find the Group record (groupId here is the facebook group slug/id)
      let group = await prisma.group.findFirst({
        where: {
          OR: [
            { externalGroupId: groupId },
            { url: `https://www.facebook.com/groups/${groupId}` },
            { url: `https://www.facebook.com/groups/${groupId}/` },
          ],
        },
      });
      if (!group) {
        // Look up memberCount/privacyType from FacebookGroup
        const fbGroup = await prisma.facebookGroup.findFirst({
          where: { userId, groupId },
          select: { memberCount: true, privacyType: true, groupName: true },
        });
        group = await prisma.group.create({
          data: {
            name: fbGroup?.groupName || groupId,
            url: `https://www.facebook.com/groups/${groupId}`,
            externalGroupId: groupId,
            memberCount: fbGroup?.memberCount || null,
            privacyType: fbGroup?.privacyType || null,
          },
        });
      } else if (!group.memberCount) {
        // Sync memberCount from FacebookGroup if missing
        const fbGroup = await prisma.facebookGroup.findFirst({
          where: { userId, groupId },
          select: { memberCount: true, privacyType: true },
        });
        if (fbGroup?.memberCount) {
          group = await prisma.group.update({
            where: { id: group.id },
            data: {
              memberCount: fbGroup.memberCount,
              privacyType: fbGroup.privacyType || group.privacyType,
            },
          });
        }
      }

      const postGroup = await prisma.postGroup.create({
        data: {
          postId: post.id,
          groupId: group.id,
          userId,
        },
      });

      // Create schedule
      if (scheduleMode === "now") {
        // Immediate publish — create job scheduled for now
        await prisma.publicationJob.create({
          data: {
            postGroupId: postGroup.id,
            scheduledAt: new Date(),
          },
        });
      } else if (scheduleMode === "both") {
        // Create ONE-TIME schedule + job
        if (scheduledAt) {
          await prisma.postGroupSchedule.create({
            data: {
              postGroupId: postGroup.id,
              frequencyType: "ONCE",
              startAt: scheduledAt,
              nextRunAt: scheduledAt,
              isActive: true,
            },
          });
          await prisma.publicationJob.create({
            data: {
              postGroupId: postGroup.id,
              scheduledAt,
            },
          });
        }

        // Create RECURRING schedule + job
        if (recurringScheduledAt) {
          await prisma.postGroupSchedule.create({
            data: {
              postGroupId: postGroup.id,
              frequencyType: "WEEKLY",
              startAt: recurringScheduledAt,
              nextRunAt: recurringScheduledAt,
              endAt: recurringEndDate
                ? new Date(`${recurringEndDate}T23:59:59`)
                : null,
              isActive: true,
            },
          });
          await prisma.publicationJob.create({
            data: {
              postGroupId: postGroup.id,
              scheduledAt: recurringScheduledAt,
            },
          });
        }
      } else if (scheduledAt) {
        const frequencyType = campaignType === "RECURRING" ? "WEEKLY" : "ONCE";
        await prisma.postGroupSchedule.create({
          data: {
            postGroupId: postGroup.id,
            frequencyType,
            startAt: scheduledAt,
            nextRunAt: scheduledAt,
            endAt:
              frequencyType === "WEEKLY" && recurringEndDate
                ? new Date(`${recurringEndDate}T23:59:59`)
                : null,
            isActive: true,
          },
        });

        // Create publication job
        await prisma.publicationJob.create({
          data: {
            postGroupId: postGroup.id,
            scheduledAt,
          },
        });
      }

      results.push(postGroup.id);
    }

    // Create a profile publication job if publishToProfile is true
    if (publishToProfile) {
      if (scheduleMode === "now") {
        await prisma.publicationJob.create({
          data: {
            postId: post.id,
            scheduledAt: new Date(),
            targetType: "PROFILE",
          },
        });
      } else if (scheduleMode === "both") {
        // One-time profile job
        if (scheduledAt) {
          await prisma.postGroupSchedule.create({
            data: {
              postId: post.id,
              targetType: "PROFILE",
              platform: "FACEBOOK",
              frequencyType: "ONCE",
              startAt: scheduledAt,
              nextRunAt: scheduledAt,
              isActive: true,
            },
          });
          await prisma.publicationJob.create({
            data: {
              postId: post.id,
              scheduledAt,
              targetType: "PROFILE",
            },
          });
        }
        // Recurring profile job
        if (recurringScheduledAt) {
          await prisma.postGroupSchedule.create({
            data: {
              postId: post.id,
              targetType: "PROFILE",
              platform: "FACEBOOK",
              frequencyType: "WEEKLY",
              startAt: recurringScheduledAt,
              nextRunAt: recurringScheduledAt,
              endAt: recurringEndDate
                ? new Date(`${recurringEndDate}T23:59:59`)
                : null,
              isActive: true,
            },
          });
          await prisma.publicationJob.create({
            data: {
              postId: post.id,
              scheduledAt: recurringScheduledAt,
              targetType: "PROFILE",
            },
          });
        }
      } else if (scheduledAt) {
        const frequencyType = campaignType === "RECURRING" ? "WEEKLY" : "ONCE";
        await prisma.postGroupSchedule.create({
          data: {
            postId: post.id,
            targetType: "PROFILE",
            platform: "FACEBOOK",
            frequencyType,
            startAt: scheduledAt,
            nextRunAt: scheduledAt,
            endAt: recurringEndDate
              ? new Date(`${recurringEndDate}T23:59:59`)
              : null,
            isActive: true,
          },
        });
        await prisma.publicationJob.create({
          data: {
            postId: post.id,
            scheduledAt,
            targetType: "PROFILE",
          },
        });
      }
    }

    // Create Instagram publication jobs if instagramEnabled is true
    if (instagramEnabled) {
      // Verify user has an active Instagram connection
      const igAccount = await prisma.connectedAccount.findFirst({
        where: { userId: req.user.id, provider: "INSTAGRAM", status: "ACTIVE" },
      });
      if (igAccount) {
        const igTypes = Array.isArray(instagramPublishTypes)
          ? instagramPublishTypes
          : instagramPublishType
            ? instagramPublishType.split(",")
            : ["FEED"];

        for (const igType of igTypes) {
          let igScheduledAt = null;
          let igIsRecurring = false;
          let igEndAt = null;
          const typeSchedule = igPerTypeSchedules?.[igType];

          if (typeSchedule && typeSchedule.mode) {
            // Per-type schedule provided
            if (typeSchedule.mode === "now") {
              igScheduledAt = new Date();
            } else if (
              typeSchedule.mode === "scheduled" &&
              typeSchedule.date &&
              typeSchedule.time
            ) {
              igScheduledAt = new Date(
                `${typeSchedule.date}T${typeSchedule.time}:00`,
              );
            } else if (typeSchedule.mode === "recurring") {
              igIsRecurring = true;
              const effectiveTime = Object.values(typeSchedule.dayTimes || {})
                .flat()
                .filter((t) => t?.trim())[0];
              if (effectiveTime && typeSchedule.startDate) {
                igScheduledAt = new Date(
                  `${typeSchedule.startDate}T${effectiveTime}:00`,
                );
              } else if (effectiveTime) {
                igScheduledAt = new Date();
                const [h, m] = effectiveTime.split(":").map(Number);
                igScheduledAt.setHours(h, m, 0, 0);
                if (igScheduledAt <= new Date())
                  igScheduledAt.setDate(igScheduledAt.getDate() + 1);
              }
              if (typeSchedule.endDate) {
                igEndAt = new Date(`${typeSchedule.endDate}T23:59:59`);
              }
            }
          } else {
            // Fallback: use global schedule
            if (scheduleMode === "now") {
              igScheduledAt = new Date();
            } else {
              igScheduledAt = scheduledAt || recurringScheduledAt;
              if (
                campaignType === "RECURRING" ||
                scheduleMode === "recurring"
              ) {
                igIsRecurring = true;
                if (recurringEndDate) {
                  igEndAt = new Date(`${recurringEndDate}T23:59:59`);
                }
              }
            }
          }

          if (igScheduledAt) {
            // Create schedule record for recurring IG jobs
            if (igIsRecurring) {
              await prisma.postGroupSchedule.create({
                data: {
                  postId: post.id,
                  targetType: "INSTAGRAM",
                  platform: "INSTAGRAM",
                  igPublishType: igType,
                  frequencyType: "WEEKLY",
                  startAt: igScheduledAt,
                  nextRunAt: igScheduledAt,
                  endAt: igEndAt,
                  isActive: true,
                },
              });
            }

            await prisma.publicationJob.create({
              data: {
                postId: post.id,
                scheduledAt: igScheduledAt,
                targetType: "INSTAGRAM",
                platform: "INSTAGRAM",
                igPublishType: igType,
              },
            });
          }
        }
      }
    }

    // Create WhatsApp publication jobs if whatsappEnabled is true
    if (whatsappEnabled && whatsappTargets?.length) {
      let waScheduledAt = null;
      let waIsRecurring = false;
      let waEndAt = null;

      if (!waScheduleMode || waScheduleMode === "now") {
        waScheduledAt = new Date();
      } else if (
        waScheduleMode === "scheduled" &&
        waScheduleDate &&
        waScheduleTime
      ) {
        waScheduledAt = new Date(`${waScheduleDate}T${waScheduleTime}:00`);
      } else if (waScheduleMode === "recurring") {
        waIsRecurring = true;
        const effectiveTime = Object.values(waDayTimes || {})
          .flat()
          .filter((t) => t?.trim())[0];
        if (effectiveTime) {
          const [hours, minutes] = effectiveTime.split(":").map(Number);
          const sortedDays = [...(waRecurringDays || [])].sort((a, b) => a - b);

          if (waRecurringStartDate) {
            const startDate = new Date(
              `${waRecurringStartDate}T${effectiveTime}:00`,
            );
            if (startDate > new Date()) {
              // Start date is in the future — find the first matching day on or after it
              const startDay = startDate.getDay();
              if (sortedDays.length > 0 && !sortedDays.includes(startDay)) {
                let nextDay =
                  sortedDays.find((d) => d > startDay) ?? sortedDays[0];
                let daysUntil =
                  nextDay > startDay
                    ? nextDay - startDay
                    : 7 - startDay + nextDay;
                startDate.setDate(startDate.getDate() + daysUntil);
              }
              waScheduledAt = startDate;
            } else {
              // Start date is today or past — find next occurrence from now
              const now = new Date();
              const today = now.getDay();
              let nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
              let daysUntil =
                nextDay > today ? nextDay - today : 7 - today + nextDay;
              if (nextDay === today) {
                const todayTime = new Date();
                todayTime.setHours(hours, minutes, 0, 0);
                if (todayTime > now) daysUntil = 0;
                else {
                  nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
                  daysUntil =
                    nextDay > today ? nextDay - today : 7 - today + nextDay;
                  if (daysUntil === 0) daysUntil = 7;
                }
              }
              waScheduledAt = new Date(now);
              waScheduledAt.setDate(waScheduledAt.getDate() + daysUntil);
              waScheduledAt.setHours(hours, minutes, 0, 0);
            }
          } else {
            // No start date — compute next occurrence from now
            const now = new Date();
            const today = now.getDay();
            let nextDay =
              sortedDays.length > 0
                ? (sortedDays.find((d) => d > today) ?? sortedDays[0])
                : today;
            let daysUntil =
              nextDay > today ? nextDay - today : 7 - today + nextDay;
            if (nextDay === today) {
              const todayTime = new Date();
              todayTime.setHours(hours, minutes, 0, 0);
              if (todayTime > now) daysUntil = 0;
              else {
                nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
                daysUntil =
                  nextDay > today ? nextDay - today : 7 - today + nextDay;
                if (daysUntil === 0) daysUntil = 7;
              }
            }
            waScheduledAt = new Date(now);
            waScheduledAt.setDate(waScheduledAt.getDate() + daysUntil);
            waScheduledAt.setHours(hours, minutes, 0, 0);
          }
        }
        if (waRecurringEndDate) {
          waEndAt = new Date(`${waRecurringEndDate}T23:59:59`);
        }
      }

      if (waScheduledAt) {
        if (waIsRecurring) {
          await prisma.postGroupSchedule.create({
            data: {
              postId: post.id,
              targetType: "WHATSAPP",
              platform: "WHATSAPP",
              frequencyType: "WEEKLY",
              startAt: waScheduledAt,
              nextRunAt: waScheduledAt,
              endAt: waEndAt,
              isActive: true,
            },
          });
        }

        await prisma.publicationJob.create({
          data: {
            postId: post.id,
            scheduledAt: waScheduledAt,
            targetType: "WHATSAPP",
            platform: "WHATSAPP",
          },
        });
      }
    }

    log.info("Campaign created", {
      userId,
      postId: post.id,
      status: post.status,
      scheduleMode: scheduleMode || "draft",
      campaignType: post.campaignType,
      groupsCount: Array.isArray(groupIds) ? groupIds.length : 0,
      imagesCount: req.files?.images?.length || 0,
      instagramEnabled: Boolean(instagramEnabled),
      whatsappEnabled: Boolean(whatsappEnabled),
      publishToProfile: Boolean(publishToProfile),
      scheduledJobsCount: results.length,
    });

    res.json({
      success: true,
      postId: post.id,
      message:
        scheduleMode === "now"
          ? "הפרסום מתבצע כעת..."
          : scheduleMode === "both"
            ? `הקמפיין תוזמן: חד-פעמי ב-${scheduledAt?.toLocaleString("he-IL")} + חוזר`
            : scheduledAt
              ? `הקמפיין תוזמן ל-${scheduledAt.toLocaleString("he-IL")}`
              : "הקמפיין נוצר כטיוטה",
      scheduled: results.length,
    });

    // Trigger immediate processing for "now" mode
    if (scheduleMode === "now") {
      triggerImmediateProcess();
    }
  }),
);

// ─── Get recent drafts and history for restore ──────────

router.get(
  "/campaigns/recent",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const postInclude = {
      media: {
        orderBy: { orderIndex: "asc" },
        select: { url: true, orderIndex: true, igType: true, mediaType: true },
      },
      postGroups: {
        include: {
          group: {
            select: { id: true, name: true, url: true, pictureUrl: true },
          },
          schedules: { where: { isActive: true }, take: 1 },
        },
      },
    };

    // Run both queries in parallel — they are independent
    const [drafts, history] = await Promise.all([
      // Get drafts (incomplete campaigns)
      prisma.post.findMany({
        where: { userId, status: "DRAFT" },
        include: postInclude,
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      // Get last 10 completed/active campaigns for "restore from history"
      prisma.post.findMany({
        where: { userId, status: { in: ["ACTIVE", "ARCHIVED"] } },
        include: postInclude,
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const mapPost = (p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      imageUrl: p.media?.[0]?.url || p.imageUrl || null,
      images: p.media?.map((m) => m.url) || [],
      status: p.status,
      isAnonymous: p.isAnonymous,
      location: p.location,
      groups:
        p.postGroups
          ?.map((pg) => ({
            id: pg.group?.id,
            name: pg.group?.name,
            url: pg.group?.url,
            pictureUrl: pg.group?.pictureUrl,
            externalId:
              pg.group?.url?.split("/groups/")?.[1]?.replace(/\/$/, "") ||
              pg.group?.id,
          }))
          .filter((g) => g.name) || [],
      groupNames:
        p.postGroups?.map((pg) => pg.group?.name).filter(Boolean) || [],
      groupCount: p.postGroups?.length || 0,
      campaignType: p.campaignType,
      recurringDays: p.recurringDays || [],
      recurringTime: p.recurringTime,
      recurringTimes: p.recurringTimes || [],
      dayTimes: p.dayTimes || null,
      recurringStart: p.recurringStart,
      recurringEnd: p.recurringEnd,
      scheduleMode:
        p.campaignType === "BOTH"
          ? "both"
          : p.campaignType === "RECURRING"
            ? "recurring"
            : p.postGroups?.some((pg) => pg.schedules?.length > 0)
              ? "scheduled"
              : "now",
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });

    res.json({
      success: true,
      drafts: drafts.map(mapPost),
      history: history.map(mapPost),
    });
  }),
);

// ─── Get campaigns (posts with campaign data) ───────────

router.get(
  "/campaigns",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const posts = await prisma.post.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        content: true,
        templateName: true,
        imageUrl: true,
        campaignType: true,
        status: true,
        isPaused: true,
        isAnonymous: true,
        location: true,
        recurringDays: true,
        recurringTime: true,
        publishToProfile: true,
        instagramEnabled: true,
        whatsappEnabled: true,
        createdAt: true,
        updatedAt: true,
        media: {
          orderBy: { orderIndex: "asc" },
          select: { url: true, igType: true, mediaType: true },
        },
        publicationHistory: {
          select: { id: true, platform: true },
        },
        postGroups: {
          select: {
            group: {
              select: {
                id: true,
                name: true,
                memberCount: true,
                pictureUrl: true,
              },
            },
            schedules: {
              where: { isActive: true },
              take: 1,
              select: { nextRunAt: true },
            },
            jobs: {
              where: { status: { in: ["PENDING", "RUNNING"] } },
              take: 1,
              select: { scheduledAt: true },
            },
            publicationHistory: {
              orderBy: { publishedAt: "desc" },
              take: 1,
              select: { externalPostUrl: true, status: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const campaigns = posts.map((post) => {
      const groupNames = post.postGroups.map((pg) => pg.group?.name || "");
      const hasActiveSchedule = post.postGroups.some(
        (pg) => pg.schedules.length > 0,
      );
      const hasPendingJob = post.postGroups.some((pg) => pg.jobs.length > 0);
      const hasPublished = post.postGroups.some(
        (pg) => pg.publicationHistory?.[0]?.status === "SUCCESS",
      );

      let displayStatus;
      if (post.isPaused) displayStatus = "paused";
      else if (post.status === "DRAFT") displayStatus = "draft";
      else if (post.campaignType === "BOTH") displayStatus = "both";
      else if (post.campaignType === "RECURRING") displayStatus = "recurring";
      else if (hasPendingJob || hasActiveSchedule) displayStatus = "scheduled";
      else if (hasPublished) displayStatus = "published";
      else displayStatus = "active";

      return {
        id: post.id,
        title: post.title,
        content: post.content,
        templateName: post.templateName || null,
        imageUrl: post.imageUrl || post.media?.[0]?.url || null,
        imageCount:
          post.media?.filter((m) => !m.igType).length ||
          (post.imageUrl ? 1 : 0),
        images:
          post.media?.filter((m) => !m.igType).map((m) => m.url) ||
          (post.imageUrl ? [post.imageUrl] : []),
        igTypeMedia: {
          FEED:
            post.media
              ?.filter((m) => m.igType === "FEED")
              .map((m) => ({ url: m.url, mediaType: m.mediaType })) || [],
          STORY:
            post.media
              ?.filter((m) => m.igType === "STORY")
              .map((m) => ({ url: m.url, mediaType: m.mediaType })) || [],
          REEL:
            post.media
              ?.filter((m) => m.igType === "REEL")
              .map((m) => ({ url: m.url, mediaType: m.mediaType })) || [],
        },
        campaignType: post.campaignType,
        status: displayStatus,
        isPaused: post.isPaused,
        isAnonymous: post.isAnonymous,
        location: post.location,
        recurringDays: post.recurringDays,
        recurringTime: post.recurringTime,
        groupCount: post.postGroups.length,
        groupNames,
        groups: post.postGroups.map((pg) => ({
          id: pg.group?.id,
          name: pg.group?.name,
          memberCount: pg.group?.memberCount || 0,
          image: pg.group?.pictureUrl || null,
        })),
        totalExposure: post.postGroups.reduce(
          (sum, pg) => sum + (pg.group?.memberCount || 0),
          0,
        ),
        publishedCount: post.publicationHistory?.length || 0,
        publishToProfile: post.publishToProfile || false,
        instagramEnabled: post.instagramEnabled || false,
        whatsappEnabled:
          post.whatsappEnabled ||
          post.publicationHistory?.some((h) => h.platform === "WHATSAPP") ||
          false,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        scheduledAt:
          post.postGroups
            .map(
              (pg) => pg.jobs?.[0]?.scheduledAt || pg.schedules?.[0]?.nextRunAt,
            )
            .filter(Boolean)
            .sort((a, b) => new Date(a) - new Date(b))[0] || null,
        postUrl:
          post.postGroups
            .map((pg) => pg.publicationHistory?.[0]?.externalPostUrl)
            .find((u) => u) || null,
      };
    });

    res.json({ success: true, campaigns });
  }),
);

// ─── Get single campaign with publication history ────────

router.get(
  "/campaigns/:postId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await prisma.post.findFirst({
      where: { id: postId, userId },
      include: {
        media: { orderBy: { orderIndex: "asc" } },
        postGroups: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
                memberCount: true,
                pictureUrl: true,
              },
            },
            publicationHistory: {
              orderBy: { publishedAt: "desc" },
              select: {
                id: true,
                status: true,
                publishedAt: true,
                externalPostUrl: true,
                groupId: true,
                targetType: true,
                platform: true,
                metrics: {
                  orderBy: { collectedAt: "desc" },
                  take: 1,
                  select: { likesCount: true, commentsCount: true },
                },
              },
            },
          },
        },
      },
    });

    if (!post) return res.status(404).json({ error: "Post not found" });

    // Fetch Instagram/Profile publication history (not tied to postGroups)
    const directHistory = await prisma.publicationHistory.findMany({
      where: { postId, userId, postGroupId: null },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        status: true,
        publishedAt: true,
        externalPostUrl: true,
        groupId: true,
        targetType: true,
        platform: true,
        publicationJobId: true,
        metrics: {
          orderBy: { collectedAt: "desc" },
          take: 1,
          select: { likesCount: true, commentsCount: true },
        },
      },
    });

    // Count total and pending jobs for live progress tracking
    const jobCounts = await prisma.publicationJob.groupBy({
      by: ["status"],
      where: {
        OR: [{ postGroup: { postId } }, { postId }],
      },
      _count: true,
    });
    const totalJobs = jobCounts.reduce((sum, j) => sum + j._count, 0);
    const pendingJobs = jobCounts
      .filter((j) => j.status === "PENDING" || j.status === "RUNNING")
      .reduce((sum, j) => sum + j._count, 0);
    const completedJobs = jobCounts
      .filter((j) => j.status === "SUCCESS" || j.status === "FAILED")
      .reduce((sum, j) => sum + j._count, 0);

    // Build publication history grouped by group
    const publicationHistory = [
      ...post.postGroups.flatMap((pg) =>
        pg.publicationHistory.map((h) => ({
          id: h.id,
          groupId: pg.group?.id,
          groupName: pg.group?.name || "",
          groupImage: pg.group?.pictureUrl || null,
          status: h.status,
          publishedAt: h.publishedAt,
          postUrl: h.externalPostUrl || null,
          targetType: h.targetType || "GROUP",
          platform: h.platform || "FACEBOOK",
          likes: h.metrics?.[0]?.likesCount || 0,
          comments: h.metrics?.[0]?.commentsCount || 0,
        })),
      ),
      ...directHistory.flatMap((h) => {
        if (h.platform === "WHATSAPP" || h.targetType === "WHATSAPP") {
          return [
            {
              id: h.id,
              groupId: null,
              groupName: "וואטסאפ",
              groupImage: null,
              status: h.status,
              publishedAt: h.publishedAt,
              postUrl: null,
              targetType: "WHATSAPP",
              platform: "WHATSAPP",
              likes: null,
              comments: null,
            },
          ];
        }
        if (
          h.platform === "INSTAGRAM" &&
          post.instagramPublishType?.includes(",")
        ) {
          // Multiple IG types - create separate history entries per type
          const types = post.instagramPublishType.split(",");
          const typeLabels = {
            FEED: "אינסטגרם פוסט",
            STORY: "אינסטגרם סטורי",
            REEL: "אינסטגרם ריל",
          };
          return types.map((type, _idx) => ({
            id: `${h.id}_${type}`,
            originalId: h.id,
            groupId: null,
            groupName: typeLabels[type] || "אינסטגרם",
            groupImage: null,
            status: h.status,
            publishedAt: h.publishedAt,
            postUrl: type === "STORY" ? null : h.externalPostUrl || null,
            targetType: "INSTAGRAM",
            platform: "INSTAGRAM",
            igPublishType: type,
            likes: type === "STORY" ? null : h.metrics?.[0]?.likesCount || 0,
            comments:
              type === "STORY" ? null : h.metrics?.[0]?.commentsCount || 0,
          }));
        }
        const igType =
          h.platform === "INSTAGRAM"
            ? post.instagramPublishType || "FEED"
            : null;
        const typeLabels = {
          FEED: "אינסטגרם פוסט",
          STORY: "אינסטגרם סטורי",
          REEL: "אינסטגרם ריל",
        };
        return [
          {
            id: h.id,
            groupId: null,
            groupName:
              h.targetType === "INSTAGRAM"
                ? typeLabels[igType] || "אינסטגרם"
                : h.targetType === "PROFILE"
                  ? "פרופיל אישי"
                  : h.targetType === "WHATSAPP"
                    ? "וואטסאפ"
                    : "",
            groupImage: null,
            status: h.status,
            publishedAt: h.publishedAt,
            postUrl: igType === "STORY" ? null : h.externalPostUrl || null,
            targetType: h.targetType || "INSTAGRAM",
            platform: h.platform || "INSTAGRAM",
            igPublishType: igType,
            likes: igType === "STORY" ? null : h.metrics?.[0]?.likesCount || 0,
            comments:
              igType === "STORY" ? null : h.metrics?.[0]?.commentsCount || 0,
          },
        ];
      }),
    ];

    const campaign = {
      id: post.id,
      title: post.title,
      content: post.content,
      images:
        post.media?.map((m) => m.url) || (post.imageUrl ? [post.imageUrl] : []),
      groups: post.postGroups.map((pg) => ({
        id: pg.group?.id,
        name: pg.group?.name,
        memberCount: pg.group?.memberCount || 0,
        image: pg.group?.pictureUrl || null,
      })),
      publishToProfile: post.publishToProfile || false,
      instagramEnabled: post.instagramEnabled || false,
      instagramPublishType: post.instagramPublishType || null,
      whatsappEnabled: post.whatsappEnabled || false,
      whatsappTargets: post.whatsappTargets || null,
      publicationHistory,
      totalJobs,
      pendingJobs,
      completedJobs,
    };

    res.json({ success: true, campaign });
  }),
);

// ─── Toggle campaign pause ───────────────────────────────

router.patch(
  "/campaigns/:postId/pause",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { postId } = req.params;

    const post = await prisma.post.findFirst({
      where: { id: postId, userId: req.user.id },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const updated = await prisma.post.update({
      where: { id: postId },
      data: { isPaused: !post.isPaused },
    });

    // If pausing, cancel ALL pending jobs (groups + profile + Instagram)
    if (updated.isPaused) {
      await prisma.publicationJob.updateMany({
        where: {
          OR: [
            { postGroup: { postId, userId: req.user.id }, status: "PENDING" },
            { postId, status: "PENDING" },
          ],
        },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      // Deactivate all recurring schedules
      await prisma.postGroupSchedule.updateMany({
        where: {
          OR: [{ postGroup: { postId } }, { postId }],
          isActive: true,
        },
        data: { isActive: false },
      });
    } else {
      // Resuming — reactivate schedules and regenerate next jobs
      const schedules = await prisma.postGroupSchedule.findMany({
        where: {
          OR: [{ postGroup: { postId } }, { postId }],
          frequencyType: { not: "ONCE" },
        },
      });
      for (const schedule of schedules) {
        // Calculate next run from now
        const now = new Date();
        let nextRunAt =
          schedule.startAt && schedule.startAt > now ? schedule.startAt : now;
        // Skip if endAt already passed
        if (schedule.endAt && schedule.endAt < now) continue;
        await prisma.postGroupSchedule.update({
          where: { id: schedule.id },
          data: { isActive: true, nextRunAt },
        });
      }
    }

    log.info("Campaign pause toggled", {
      userId: req.user.id,
      postId,
      isPaused: updated.isPaused,
    });

    res.json({
      success: true,
      isPaused: updated.isPaused,
      message: updated.isPaused ? "הקמפיין הושהה" : "הקמפיין הופעל מחדש",
    });
  }),
);
// ─── Update campaign ─────────────────────────────────────

router.put(
  "/campaigns/:postId",
  requireAuth,
  campaignUpload,
  asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await prisma.post.findFirst({
      where: { id: postId, userId },
      include: { postGroups: true },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const {
      text,
      title,
      location,
      campaignType,
      recurringTime,
      scheduleMode,
      scheduleDate,
      scheduleTime,
    } = req.body;
    let { anonymous, groupIds, recurringDays } = req.body;

    // Parse stringified arrays from FormData
    if (typeof groupIds === "string") groupIds = JSON.parse(groupIds);
    if (typeof recurringDays === "string")
      recurringDays = JSON.parse(recurringDays);
    if (anonymous === "true") anonymous = true;
    if (anonymous === "false") anonymous = false;

    // Update post fields
    const updateData = {};
    if (text !== undefined) updateData.content = text;
    if (title !== undefined) updateData.title = title;
    if (anonymous !== undefined) updateData.isAnonymous = anonymous;
    if (location !== undefined) updateData.location = location || null;
    if (campaignType !== undefined) updateData.campaignType = campaignType;
    if (recurringDays !== undefined) updateData.recurringDays = recurringDays;
    if (recurringTime !== undefined)
      updateData.recurringTime = recurringTime || null;

    await prisma.post.update({ where: { id: postId }, data: updateData });

    // If new images uploaded, replace existing media
    const globalFiles = req.files?.images;
    if (globalFiles?.length) {
      await prisma.postMedia.deleteMany({ where: { postId, igType: null } });
      await prisma.post.update({
        where: { id: postId },
        data: { imageUrl: `/uploads/${globalFiles[0].filename}` },
      });
      for (let i = 0; i < globalFiles.length; i++) {
        await prisma.postMedia.create({
          data: {
            postId,
            mediaType: globalFiles[i].mimetype?.startsWith("video/")
              ? "VIDEO"
              : "IMAGE",
            url: `/uploads/${globalFiles[i].filename}`,
            orderIndex: i,
          },
        });
      }
    }

    // Handle per-IG-type media
    for (const igType of ["FEED", "STORY", "REEL"]) {
      const typeFiles = req.files?.[`igMedia_${igType}`];
      if (typeFiles?.length) {
        await prisma.postMedia.deleteMany({ where: { postId, igType } });
        for (let i = 0; i < typeFiles.length; i++) {
          await prisma.postMedia.create({
            data: {
              postId,
              mediaType: typeFiles[i].mimetype?.startsWith("video/")
                ? "VIDEO"
                : "IMAGE",
              url: `/uploads/${typeFiles[i].filename}`,
              orderIndex: i,
              igType,
            },
          });
        }
      }
    }

    // If groupIds provided, sync post groups
    if (groupIds?.length) {
      const existingGroupIds = post.postGroups.map((pg) => pg.groupId);
      const toAdd = groupIds.filter((gid) => !existingGroupIds.includes(gid));
      const toRemove = existingGroupIds.filter(
        (gid) => !groupIds.includes(gid),
      );

      // Remove old groups (cascade deletes schedules + jobs)
      if (toRemove.length) {
        await prisma.postGroup.deleteMany({
          where: { postId, groupId: { in: toRemove } },
        });
      }

      // Add new groups
      for (const groupId of toAdd) {
        await prisma.postGroup.create({
          data: { postId, groupId, userId },
        });
      }

      // Re-schedule if schedule info provided
      if (scheduleMode && scheduleMode !== "now") {
        let scheduledAt = null;
        if (scheduleMode === "scheduled" && scheduleDate && scheduleTime) {
          scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);
        } else if (scheduleMode === "recurring" && recurringTime) {
          const now = new Date();
          const [hours, minutes] = recurringTime.split(":").map(Number);
          const today = now.getDay();
          const sortedDays = [...(recurringDays || [])].sort((a, b) => a - b);
          let nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
          let daysUntil =
            nextDay > today ? nextDay - today : 7 - today + nextDay;
          if (nextDay === today) {
            const todayTime = new Date();
            todayTime.setHours(hours, minutes, 0, 0);
            if (todayTime > now) {
              daysUntil = 0;
            } else {
              nextDay = sortedDays.find((d) => d > today) ?? sortedDays[0];
              daysUntil =
                nextDay > today ? nextDay - today : 7 - today + nextDay;
              if (daysUntil === 0) daysUntil = 7;
            }
          }
          scheduledAt = new Date(now);
          scheduledAt.setDate(scheduledAt.getDate() + daysUntil);
          scheduledAt.setHours(hours, minutes, 0, 0);
        }

        if (scheduledAt) {
          // Cancel old pending jobs (groups + profile + Instagram)
          await prisma.publicationJob.updateMany({
            where: {
              OR: [
                { postGroup: { postId, userId }, status: "PENDING" },
                { postId, status: "PENDING" },
              ],
            },
            data: { status: "CANCELLED", completedAt: new Date() },
          });

          // Delete old schedules (will be recreated below)
          await prisma.postGroupSchedule.deleteMany({
            where: {
              OR: [{ postGroup: { postId } }, { postId }],
            },
          });

          // Create new jobs for all current groups
          const currentPostGroups = await prisma.postGroup.findMany({
            where: { postId },
          });
          for (const pg of currentPostGroups) {
            await prisma.publicationJob.create({
              data: { postGroupId: pg.id, scheduledAt },
            });
            await prisma.postGroupSchedule.create({
              data: {
                postGroupId: pg.id,
                frequencyType: campaignType === "RECURRING" ? "WEEKLY" : "ONCE",
                startAt: scheduledAt,
                nextRunAt: scheduledAt,
                isActive: true,
              },
            });
          }

          await prisma.post.update({
            where: { id: postId },
            data: { status: "ACTIVE", isPaused: false },
          });
        }
      }
    }

    log.info("Campaign updated", {
      userId,
      postId,
      updatedFields: Object.keys(updateData),
      groupsCount: Array.isArray(groupIds) ? groupIds.length : undefined,
      replacedImagesCount: globalFiles?.length || 0,
      scheduleMode: scheduleMode || null,
    });

    res.json({ success: true, message: "הקמפיין עודכן בהצלחה" });
  }),
);

// ─── Delete campaign ─────────────────────────────────────

router.delete(
  "/campaigns/:postId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { postId } = req.params;

    const post = await prisma.post.findFirst({
      where: { id: postId, userId: req.user.id },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    // Cascade delete handles postGroups, schedules, jobs
    await prisma.post.delete({ where: { id: postId } });

    log.info("Campaign deleted", { userId: req.user.id, postId });

    res.json({ success: true, message: "הקמפיין נמחק" });
  }),
);

// ─── Duplicate campaign ──────────────────────────────────

router.post(
  "/campaigns/:postId/duplicate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    const original = await prisma.post.findFirst({
      where: { id: postId, userId },
      include: {
        postGroups: { select: { groupId: true } },
        media: { orderBy: { orderIndex: "asc" } },
      },
    });
    if (!original) return res.status(404).json({ error: "Post not found" });

    const newPost = await prisma.post.create({
      data: {
        userId,
        title: original.title ? `${original.title} (עותק)` : null,
        content: original.content,
        status: "DRAFT",
        isAnonymous: original.isAnonymous,
        location: original.location,
        campaignType: original.campaignType,
        recurringDays: original.recurringDays,
        recurringTime: original.recurringTime,
        imageUrl: original.imageUrl,
      },
    });

    // Duplicate media
    for (const m of original.media) {
      await prisma.postMedia.create({
        data: {
          postId: newPost.id,
          url: m.url,
          mediaType: m.mediaType,
          orderIndex: m.orderIndex,
        },
      });
    }

    // Duplicate post groups (without schedules/jobs — user needs to reschedule)
    for (const pg of original.postGroups) {
      await prisma.postGroup.create({
        data: { postId: newPost.id, groupId: pg.groupId, userId },
      });
    }

    log.info("Campaign duplicated", {
      userId,
      originalPostId: postId,
      newPostId: newPost.id,
      groupsCount: original.postGroups.length,
      mediaCount: original.media.length,
    });

    res.json({
      success: true,
      postId: newPost.id,
      message: "הקמפיין שוכפל, יש לתזמן אותו מחדש",
    });
  }),
);

export default router;
