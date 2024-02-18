if (typeof module !== 'undefined' && module.exports) {
    module.exports = { upgrade_impl };
}

function upgrade_impl(dependencies, data) {
    const {
        add_achievement,
        add_item,
        add_item_property,
        B,
        cache_item,
        calculate_item_grade,
        calculate_item_value,
        consume,
        consume_one,
        D,
        fail_response,
        G,
        gameplay,
        in_arr,
        min,
        max,
        player,
        resend,
        S,
        server_log,
        simple_distance,
        socket,
        success_response
    } = dependencies;

    try {
        var item = player.items[data.item_num];
        var scroll = player.items[data.scroll_num];
        var offering = player.items[data.offering_num];
        var result;
        var ex = "";
        if (!player || player.user) {
            return fail_response("cant_in_bank");
        }
        if (player.q.upgrade) {
            return socket.emit("game_response", "upgrade_in_progress");
        }
        G.maps.main.upgrade.name = player.name;
        if (!player.computer && simple_distance(G.maps.main.upgrade, player) > B.sell_dist) {
            return socket.emit("game_response", { response: "distance", place: "upgrade", failed: true });
        }
        if (!item) {
            return socket.emit("game_response", "upgrade_no_item");
        }
        if (
            offering &&
            !(
                (G.items[offering.name] && G.items[offering.name].type == "offering") ||
                (G.items[offering.name] && G.items[offering.name].offering !== undefined && !(item.level > 0))
            )
        ) {
            return socket.emit("game_response", "upgrade_invalid_offering");
        }
        if (!scroll && !offering) {
            return socket.emit("game_response", "upgrade_no_scroll");
        }
        if ((item.level || 0) != data.clevel) {
            return socket.emit("game_response", "upgrade_mismatch");
        }
        var item_def = G.items[item.name];
        var scroll_def = scroll && G.items[scroll.name];
        var offering_def = offering && G.items[offering.name];
        var grade = calculate_item_grade(item_def, item);
        if (!item_def.upgrade) {
            return socket.emit("game_response", "upgrade_cant");
        }
        if (
            scroll &&
            (!in_arr(scroll_def.type, ["uscroll", "pscroll"]) ||
                (scroll_def.type == "uscroll" && !item_def.upgrade) ||
                (scroll_def.type == "pscroll" && !item_def.stat) ||
                grade > scroll_def.grade)
        ) {
            if (grade == 4 && scroll_def.type == "uscroll") {
                return socket.emit("game_response", {
                    response: "max_level",
                    level: item.level,
                    place: "upgrade",
                    failed: true,
                });
            }
            return socket.emit("game_response", "upgrade_incompatible_scroll");
        }

        var new_level = (item.level || 0) + 1;
        var probability = 1;
        var oprobability = 1;
        var grace = 0;
        var high = false;
        var ograde = calculate_item_grade(item_def, { name: item.name, level: 0 });
        var tmult = 1;
        if (ograde == 1) {
            tmult = 1.5;
        } else if (ograde == 2) {
            tmult = 2;
        }

        delete player.p.u_item;
        delete player.p.u_type;
        delete player.p.u_itemx;
        delete player.p.u_roll;
        delete player.p.u_fail;
        delete player.p.u_level;

        player.p.u_level = item.level || 0;

        if (!scroll) {
            if (G.items[offering.name] && G.items[offering.name].offering !== undefined) {
                var chance = 0.16;
                var ms = 0;
                if (
                    G.items[offering.name].offering > ograde ||
                    (G.items[offering.name].offering == 2 && calculate_item_value(item) <= 20000000)
                ) {
                    chance = 0.32;
                }
                chance *= [2.8, 1.6, 1][ograde];
                if (G.items[offering.name].offering < ograde) {
                    return socket.emit("game_response", "upgrade_invalid_offering");
                }
                if (data.calculate) {
                    return success_response("upgrade_chance", {
                        calculate: true,
                        chance: chance,
                        offering: offering.name,
                        item: cache_item(item),
                        grace: item.grace || 0,
                    });
                }
                var result = Math.random();

                consume_one(player, data.offering_num);
                player.p.u_type = "normal";
                player.p.u_roll = result;
                if (player.s.massproduction) {
                    ms /= 2;
                    delete player.s.massproduction;
                    ex = "+u+cid";
                }
                if (player.s.massproductionpp) {
                    ms /= 10;
                    delete player.s.massproductionpp;
                    ex = "+u+cid";
                }
                player.q.upgrade = { ms: ms, len: ms, num: data.item_num, silent: true };
                player.items[data.item_num] = {
                    name: "placeholder",
                    p: {
                        chance: chance,
                        name: item.name,
                        level: item.level,
                        scroll: null,
                        offering: offering.name,
                        nums: [],
                    },
                };

                if (result <= chance) {
                    item.p = "shiny";
                    player.p.u_item = item;
                } else {
                    player.p.u_item = item;
                    player.p.u_fail = true;
                }
            } else {
                var ms = 0;
                if (data.calculate) {
                    return success_response("upgrade_chance", {
                        calculate: true,
                        chance: 1,
                        offering: offering.name,
                        item: cache_item(item),
                        grace: item.grace || 0,
                    });
                }
                consume_one(player, data.offering_num);
                item.grace = (item.grace || 0) + 0.5;
                server_log("item.grace: " + item.grace);
                player.p.u_type = "offering";
                player.p.u_item = item;
                player.p.u_roll = 0.999999999999999;
                if (player.s.massproduction) {
                    ms /= 2;
                    delete player.s.massproduction;
                    ex = "+u+cid";
                }
                if (player.s.massproductionpp) {
                    ms /= 10;
                    delete player.s.massproductionpp;
                    ex = "+u+cid";
                }
                player.q.upgrade = { ms: ms, len: ms, num: data.item_num };
                player.items[data.item_num] = {
                    name: "placeholder",
                    p: { chance: 1, name: item.name, level: item.level, scroll: null, offering: offering.name, nums: [] },
                };
            }
        } else if (scroll_def.type == "uscroll") {
            if (item.l) {
                return socket.emit("game_response", { response: "item_locked", place: "upgrade", failed: true });
            }
            if (grade == 4) {
                return socket.emit("game_response", {
                    response: "max_level",
                    level: item.level,
                    place: "upgrade",
                    failed: true,
                });
            }
            if (!data.calculate) {
                consume_one(player, data.scroll_num);
            }
            oprobability = probability = D.upgrades[item_def.igrade][new_level];
            // grace=max(0,min(new_level+1, (item.grace||0) + min(3,player.p.ugrace[new_level]/3.0) +min(2,ugrace[new_level]/4.0) +item_def.igrace + player.p.ograce/2.0 )); - original [16/07/18]
            grace = max(
                0,
                min(new_level + 1, (item.grace || 0) + min(3, player.p.ugrace[new_level] / 4.5) + item_def.igrace) +
                min(6, S.ugrace[new_level] / 3.0) +
                player.p.ograce / 3.2,
            );
            server_log(
                "Grace num: " +
                grace +
                "\nItem: " +
                (item.grace || 0) +
                "\nPlayer: " +
                min(3, player.p.ugrace[new_level] / 4.5) +
                "\nDef: " +
                item_def.igrace +
                "\nOgrace:" +
                player.p.ograce / 3.2 +
                "\nS.ugrace: " +
                min(6, S.ugrace[new_level] / 3.0),
            );
            grace = (probability * grace) / new_level + grace / 1000.0;
            server_log("Grace-prob: " + grace);
            result = Math.random();
            server_log(result + " < " + probability);

            // if(!data.calculate && item.name=="throwingstars" && scroll_def.grade==2 && item.level==4) item.p="superfast";

            if (scroll_def.grade > grade && new_level <= 10) {
                probability = probability * 1.2 + 0.01;
                high = true;
                if (!data.calculate) {
                    item.grace = (item.grace || 0) + 0.4;
                }
            }

            if (offering) {
                var increase = 0.4;
                if (!data.calculate) {
                    consume_one(player, data.offering_num);
                }

                if (offering_def.grade > grade + 1) {
                    probability = probability * 1.7 + grace * 4;
                    high = true;
                    increase = 3;
                } else if (offering_def.grade > grade) {
                    probability = probability * 1.5 + grace * 1.2;
                    high = true;
                    increase = 1;
                } else if (offering_def.grade == grade) {
                    probability = probability * 1.4 + grace;
                } else if (offering_def.grade == grade - 1) {
                    probability = probability * 1.15 + grace / 3.2;
                    increase = 0.2;
                } else {
                    probability = probability * 1.08 + grace / 4;
                    increase = 0.1;
                }

                if (!data.calculate) {
                    item.grace = (item.grace || 0) + increase;
                } // previously +1 [16/07/18]
            } else {
                grace = max(0, grace / 4.8 - 0.4 / ((new_level - 0.999) * (new_level - 0.999)));
                probability += grace; // previously 12.0 // previously 9.0 [16/07/18]
            }

            if (!data.calculate && Math.random() < 0.025) {
                // Bonus grace
                item.grace = (item.grace || 0) + 1;
            }

            if (data.item_num == player.p.item_num && Math.random() < 0.6) {
                // Added [29/10/17]
                server_log("16 cheat");
                result = max(Math.random() / 10000.0, result * 0.975 - 0.012);
            }

            if (high) {
                probability = min(probability, min(oprobability + 0.36, oprobability * 3));
            } else {
                probability = min(probability, min(oprobability + 0.24, oprobability * 2));
            }
            server_log(result + " < " + probability + " grace: " + grace);

            if (data.calculate) {
                return success_response("upgrade_chance", {
                    calculate: true,
                    chance: probability,
                    offering: (offering && offering.name) || undefined,
                    item: cache_item(item),
                    grace: item.grace || 0,
                    scroll: scroll.name,
                });
            }

            if (gameplay == "test") {
                result = 0;
            }
            // result=probability;
            player.p.u_type = "normal";
            player.p.u_roll = result;
            var ms = 0;
            if (player.s.massproduction) {
                ms /= 2;
                delete player.s.massproduction;
                ex = "+u+cid";
            }
            if (player.s.massproductionpp) {
                ms /= 10;
                delete player.s.massproductionpp;
                ex = "+u+cid";
            }
            player.q.upgrade = { ms: ms, len: ms, num: data.item_num };
            if (gameplay == "hardcore") {
                player.q.upgrade.ms = player.q.upgrade.len = 500;
            }
            player.items[data.item_num] = {
                name: "placeholder",
                p: {
                    chance: probability,
                    name: item.name,
                    level: item.level,
                    scroll: scroll.name,
                    offering: offering && offering.name,
                    nums: [],
                },
            };

            //result=probability+EPS;

            if (result <= probability) {
                // console.log("here");
                player.p.ugrace[new_level] = S.ugrace[new_level] = 0;
                if (offering) {
                    player.p.ograce *= 0.25;
                } else {
                    player.p.ograce *= 1 - new_level * 0.005;
                }
                item.level = new_level;
                if (item.oo != player.name) {
                    item.o = player.name;
                }
                player.p.u_item = item;
                if (parseInt(result * 10000) == parseInt(probability * 10000) && grade >= 1) {
                    add_item_property(item, "lucky");
                    add_achievement(player, "lucky");
                }
            } else {
                player.p.ugrace[new_level - 1] += 1;
                S.ugrace[new_level - 1] += 1;
                player.p.ugrace[new_level] += 1;
                S.ugrace[new_level] += 1;
                if (new_level >= 8 && new_level <= 15) {
                    player.p.ugrace[new_level - 1] += 1;
                    S.ugrace[new_level - 1] += 1;
                    player.p.ugrace[new_level - 2] += 2 + ((offering && 1) || 0);
                    S.ugrace[new_level - 2] += 2;
                    player.p.ugrace[new_level - 3] += 2 + ((offering && 2) || 0);
                    S.ugrace[new_level - 3] += 3 + ((offering && 1) || 0);
                }
                if (offering) {
                    player.p.ograce += 0.6;
                } // previously 1 [16/07/18]
                if (scroll_def.grade != 3.6) {
                    player.p.u_itemx = item;
                } else {
                    player.p.u_item = item;
                    player.p.u_fail = true;
                }
                if (parseInt(result * 10000) == parseInt(probability * 10000)) {
                    if (player.esize && grade >= 1) {
                        add_item(player, "essenceofgreed");
                    }
                    add_achievement(player, "unlucky");
                }
            }
        } else if (scroll_def.type == "pscroll") {
            var needed = [1, 10, 100, 1000, 9999, 9999, 9999];
            if (scroll.q < needed[grade]) {
                return socket.emit("game_response", { response: "upgrade_scroll_q", q: needed[grade], h: scroll.q });
            }
            if (!data.calculate) {
                consume(player, data.scroll_num, needed[grade]);
            }

            if (data.calculate) {
                return success_response("upgrade_chance", {
                    calculate: true,
                    chance: 0.99999,
                    scroll: scroll.name,
                    item: cache_item(item),
                    grace: item.grace || 0,
                });
            }

            if (offering) {
                consume_one(player, data.offering_num);
                item.grace = (item.grace || 0) + 1;
                server_log("Graced up to " + item.grace);
            }

            item.stat_type = scroll_def.stat;
            player.p.u_roll = Math.random();

            player.p.u_type = "stat";
            if (player.p.u_roll <= 0.99999 || offering) {
                player.p.u_item = item;
            } else {
                player.p.u_itemx = item;
            }
            var ms = 0;
            if (player.s.massproduction) {
                ms /= 2;
                delete player.s.massproduction;
                ex = "+u+cid";
            }
            if (player.s.massproductionpp) {
                ms /= 10;
                delete player.s.massproductionpp;
                ex = "+u+cid";
            }
            player.q.upgrade = { ms: ms, len: ms, num: data.item_num };
            player.items[data.item_num] = {
                name: "placeholder",
                p: {
                    chance: 0.99999,
                    name: item.name,
                    level: item.level,
                    scroll: scroll.name,
                    offering: offering && offering.name,
                    nums: [],
                },
            };
        }

        player.citems[data.item_num] = cache_item(player.items[data.item_num]);

        resend(player, "reopen+nc+inv" + ex);
    } catch (e) {
        server_log("upgrade_e " + e);
        return socket.emit("game_response", { response: "exception", place: "upgrade", failed: true });
    }
}
